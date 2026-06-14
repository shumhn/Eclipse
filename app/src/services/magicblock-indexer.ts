import fs from 'fs';
import path from 'path';

import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import * as borsh from '@coral-xyz/borsh';
import {
  DELEGATION_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  createDelegatePermissionInstruction,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  permissionPdaFromAccount,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';

import { findKeypairByPublicKey, getDefaultKeypair, LoadedKeypair } from './solana-wallets';

const PROGRAM_ID = new PublicKey('79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t');
const MAGIC_PROGRAM_ID = new PublicKey('Magic11111111111111111111111111111111111111');
const MAGIC_CONTEXT_ID = new PublicKey('MagicContext1111111111111111111111111111111');
const EPHEMERAL_RPC_URL = 'https://devnet-tee.magicblock.app';
const ER_SPONSOR_BUFFER_LAMPORTS = 100_000;
const MARKET_SCAN_LIMIT = Number(process.env.MARKET_SCAN_LIMIT || 64);

const MarketLayout = borsh.struct([
  borsh.u64('id'),
  borsh.publicKey('creator'),
  borsh.str('question'),
  borsh.u64('end_time'),
  borsh.u64('created_at'),
  borsh.publicKey('collateral_mint'),
  borsh.publicKey('vault'),
  borsh.u64('total_deposited'),
  borsh.u64('final_reserves'),
  borsh.u64('total_claimable_settled'),
  borsh.u64('total_claimed'),
  borsh.u8('status'),
  borsh.u8('outcome'),
  borsh.u8('bump'),
]);

const PositionLayout = borsh.struct([
  borsh.publicKey('market'),
  borsh.publicKey('trader'),
  borsh.u64('collateral_deposited'),
  borsh.u64('collateral_withdrawn'),
  borsh.u64('claimable_amount'),
  borsh.u64('claimed_amount'),
  borsh.u8('delegated'),
  borsh.u8('settled'),
  borsh.u8('claimed'),
  borsh.u8('bump'),
]);

const PrivateMarketStateLayout = borsh.struct([
  borsh.publicKey('market'),
  borsh.publicKey('collateral_mint'),
  borsh.u64('end_time'),
  borsh.u64('created_at'),
  borsh.u64('reserves'),
  borsh.u64('yes_supply'),
  borsh.u64('no_supply'),
  borsh.u8('status'),
  borsh.u8('outcome'),
  borsh.u8('bump'),
]);

const PrivatePositionStateLayout = borsh.struct([
  borsh.publicKey('market'),
  borsh.publicKey('trader'),
  borsh.u64('collateral_deposited'),
  borsh.u64('collateral_available'),
  borsh.u64('yes_shares'),
  borsh.u64('no_shares'),
  borsh.u8('claimed'),
  borsh.u8('bump'),
]);

const ConfigLayout = borsh.struct([
  borsh.publicKey('admin'),
  borsh.publicKey('oracle'),
  borsh.publicKey('collateral_mint'),
  borsh.u16('protocol_fee_bps'),
  borsh.u64('min_liquidity'),
  borsh.u64('market_count'),
  borsh.u8('paused'),
  borsh.publicKey('tee_validator'),
  borsh.u8('bump'),
]);

type LayoutDecoded = Record<string, any>;

export interface ProtocolConfigState {
  address: string;
  admin: string;
  oracle: string;
  collateralMint: string;
  protocolFeeBps: bigint;
  marketCount: number;
  minLiquidity: bigint;
  bump: number;
  paused: boolean;
  teeValidator: string;
}

export interface NormalizedMarket {
  publicKey: string;
  delegated: boolean;
  ownerProgram: string;
  privacyMode: 'shielded' | 'transparent';
  positionsHidden: boolean;
  settlementState: 'delegated' | 'base';
  privacyNote?: string;
  tracked?: boolean;
  proof?: {
    createdAt?: number;
    updatedAt?: number;
    createSignature?: string;
    marketDelegationSignature?: string | null;
    creatorPositionDelegationSignature?: string | null;
    privateStateInitializationSignature?: string | null;
    resolveSignature?: string | null;
    commitSignature?: string | null;
    creatorPosition?: string;
  };
  account: {
    id: string;
    question: string;
    resolved: boolean;
    resolvable: boolean;
    creator: string;
    end_time: string;
    creation_time: string;
    initial_liquidity: string;
    yes_token_mint: string;
    no_token_mint: string;
    yes_token_supply_minted: string;
    no_token_supply_minted: string;
    collateral_token: string;
    market_reserves: string;
    winning_token_id: { None: Record<string, never> } | { Some: string };
  };
}

export interface NormalizedPosition {
  publicKey: string;
  delegated: boolean;
  market: string;
  trader: string;
  collateralDeposited: string;
  collateralAvailable: string;
  yesShares: string;
  noShares: string;
  claimed: boolean;
  bump: number;
}

function loadIdl(): Record<string, any> {
  return require('../idl.json');
}

function asNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value?.toNumber) {
    try {
      return value.toNumber();
    } catch {
      return Number(value.toString());
    }
  }
  return Number(value || 0);
}

function asBigInt(value: any): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  if (value?.toString) return BigInt(value.toString());
  return BigInt(0);
}

function pk(value: any): string {
  return value?.toBase58?.() || value?.toString?.() || '';
}

function boolFromU8(value: any): boolean {
  return asNumber(value) === 1;
}

export class MagicBlockIndexer {
  private readonly connection: Connection;
  private readonly ephemeralConnection: Connection;
  private readonly idl: Record<string, any>;
  private readonly marketDiscriminator: Buffer;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.ephemeralConnection = new Connection(EPHEMERAL_RPC_URL, 'confirmed');
    this.idl = loadIdl();
    const marketAccount = (this.idl.accounts || []).find((account: any) => account.name === 'Market');
    this.marketDiscriminator = Buffer.from(marketAccount?.discriminator || []);
    console.log(`[MagicBlockIndexer] Initialized — program ${PROGRAM_ID.toBase58()}`);
  }

  async getProtocolConfig(): Promise<ProtocolConfigState> {
    const [configPda] = this.getConfigPda();
    const info = await this.connection.getAccountInfo(configPda);
    if (!info) {
      throw new Error(
        `Protocol config ${configPda.toBase58()} is not initialized for the new IDL. ` +
          'Reads still work, but delegated execution and market creation need config bootstrap.'
      );
    }

    const decoded = ConfigLayout.decode(info.data.subarray(8)) as LayoutDecoded;
    return {
      address: configPda.toBase58(),
      admin: pk(decoded.admin),
      oracle: pk(decoded.oracle),
      collateralMint: pk(decoded.collateral_mint),
      protocolFeeBps: BigInt(asNumber(decoded.protocol_fee_bps)),
      marketCount: asNumber(decoded.market_count),
      minLiquidity: asBigInt(decoded.min_liquidity),
      bump: asNumber(decoded.bump),
      paused: boolFromU8(decoded.paused),
      teeValidator: pk(decoded.tee_validator),
    };
  }

  async getAllMarkets(): Promise<{ count: number; data: NormalizedMarket[] }> {
    const marketPubkeys = Array.from({ length: MARKET_SCAN_LIMIT }, (_, id) =>
      this.getMarketPdaById(id)[0]
    );
    const infos = await this.connection.getMultipleAccountsInfo(marketPubkeys, 'confirmed');

    const markets = await Promise.all(
      infos.map(async (account, index) => {
        if (!account) return null;
        const pubkey = marketPubkeys[index];
        if (!account.data.subarray(0, 8).equals(this.marketDiscriminator)) return null;
        try {
          const decoded = this.decodeMarketAccount(account.data);
          const privateState = await this.fetchPrivateMarketState(pubkey, account.owner);
          return this.normalizeMarket(pubkey, decoded, account.owner, privateState);
        } catch (error) {
          console.warn(
            `[MagicBlockIndexer] Skipped malformed market ${pubkey.toBase58()}:`,
            (error as Error).message
          );
          return null;
        }
      })
    );

    const data = markets.filter(Boolean) as NormalizedMarket[];
    data.sort((a, b) => Number(a.account.id) - Number(b.account.id));
    return { count: data.length, data };
  }

  async getMarketInfo(marketAddress: string): Promise<NormalizedMarket | null> {
    try {
      const pubkey = new PublicKey(marketAddress);
      const info = await this.connection.getAccountInfo(pubkey, 'confirmed');
      if (!info) return null;

      const decoded = this.decodeMarketAccount(info.data);
      const privateState = await this.fetchPrivateMarketState(pubkey, info.owner);
      return this.normalizeMarket(pubkey, decoded, info.owner, privateState);
    } catch (error) {
      console.error(`[MagicBlockIndexer] Error fetching market ${marketAddress}:`, error);
      return null;
    }
  }

  async prepareTradeTransaction(params: {
    market: string;
    side: 'yes' | 'no';
    amountUsdc: number;
    walletAddress: string;
  }): Promise<Transaction> {
    const market = await this.getMarketInfo(params.market);
    if (!market) throw new Error('Market not found');

    if (market.delegated) {
      const result = await this.preparePrivateTradeTransaction(params);
      return result.transaction;
    }

    throw new Error(
      'Transparent trading is no longer supported by the new MagicBlock IDL. ' +
        'This market must be delegated and initialized inside PER first.'
    );
  }

  async getTraderPositionInfo(marketAddress: string, traderAddress: string): Promise<NormalizedPosition | null> {
    try {
      const marketPubkey = new PublicKey(marketAddress);
      const traderPubkey = new PublicKey(traderAddress);
      const [positionPda] = this.getPositionPda(marketPubkey, traderPubkey);
      const info = await this.connection.getAccountInfo(positionPda, 'confirmed');
      if (!info) return null;

      const publicPosition = this.decodePositionAccount(info.data);
      const privatePosition = info.owner.equals(DELEGATION_PROGRAM_ID)
        ? await this.fetchPrivatePositionState(marketPubkey, traderPubkey)
        : null;

      return this.normalizePosition(positionPda, publicPosition, info.owner, privatePosition);
    } catch (error) {
      console.error('[MagicBlockIndexer] Error fetching trader position:', error);
      return null;
    }
  }

  async preparePositionSetupTransaction(params: {
    market: string;
    amountUsdc: number;
    walletAddress: string;
  }): Promise<{ transaction: Transaction; positionAddress: string; alreadyExists: boolean }> {
    const marketPubkey = new PublicKey(params.market);
    const traderPubkey = new PublicKey(params.walletAddress);
    const [configPda] = this.getConfigPda();
    const [positionPda] = this.getPositionPda(marketPubkey, traderPubkey);
    const [privatePositionPda] = this.getPrivatePositionStatePda(marketPubkey, traderPubkey);

    const marketInfo = await this.getMarketInfo(params.market);
    if (!marketInfo) throw new Error('Market not found');

    const positionInfo = await this.connection.getAccountInfo(positionPda, 'confirmed');
    if (positionInfo?.owner.equals(DELEGATION_PROGRAM_ID)) {
      throw new Error('Position already delegated in TEE; additional base deposits are not supported yet');
    }

    const collateralMint = new PublicKey(marketInfo.account.collateral_token);
    const traderCollateral = await getAssociatedTokenAddress(collateralMint, traderPubkey);
    const vault = new PublicKey(marketInfo.account.yes_token_mint);
    const amount = new BN(Math.round(params.amountUsdc * 1_000_000));

    const instructionProgram = this.createInstructionProgram(this.connection);
    const tx = new Transaction();

    if (!positionInfo) {
      const openIx = await instructionProgram.methods
        .openPosition()
        .accounts({
          trader: traderPubkey,
          config: configPda,
          market: marketPubkey,
          position: positionPda,
          privatePosition: privatePositionPda,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      tx.add(openIx);
    }

    tx.add(
      SystemProgram.transfer({
        fromPubkey: traderPubkey,
        toPubkey: positionPda,
        lamports: ER_SPONSOR_BUFFER_LAMPORTS,
      }),
      SystemProgram.transfer({
        fromPubkey: traderPubkey,
        toPubkey: privatePositionPda,
        lamports: ER_SPONSOR_BUFFER_LAMPORTS,
      })
    );

    const depositIx = await instructionProgram.methods
      .depositCollateral(amount)
      .accounts({
        trader: traderPubkey,
        config: configPda,
        market: marketPubkey,
        position: positionPda,
        privatePosition: privatePositionPda,
        collateralMint,
        traderCollateral,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    tx.add(depositIx);

    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = traderPubkey;

    return {
      transaction: tx,
      positionAddress: positionPda.toBase58(),
      alreadyExists: Boolean(positionInfo),
    };
  }

  async preparePrivateTradeTransaction(params: {
    market: string;
    side: 'yes' | 'no';
    amountUsdc: number;
    walletAddress: string;
  }): Promise<{ transaction: Transaction; positionAddress: string }> {
    const marketPubkey = new PublicKey(params.market);
    const traderPubkey = new PublicKey(params.walletAddress);
    const [configPda] = this.getConfigPda();
    const [positionPda] = this.getPositionPda(marketPubkey, traderPubkey);
    const [privatePositionPda] = this.getPrivatePositionStatePda(marketPubkey, traderPubkey);

    const market = await this.getMarketInfo(params.market);
    if (!market) throw new Error('Market not found');
    if (!market.delegated) throw new Error('Market is not delegated into MagicBlock TEE');

    const positionInfo = await this.connection.getAccountInfo(positionPda, 'confirmed');
    if (!positionInfo) throw new Error('Private position not found. Fund the position first.');
    if (!positionInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
      throw new Error('Private position is not delegated into TEE yet');
    }

    const privatePositionInfo = await this.ephemeralConnection.getAccountInfo(
      privatePositionPda,
      'confirmed'
    );

    const publicPosition = this.decodePositionAccount(positionInfo.data);
    const privatePosition = privatePositionInfo
      ? this.decodePrivatePositionState(privatePositionInfo.data)
      : null;

    const amountLamports = Math.round(params.amountUsdc * 1_000_000);
    const l1Available = asBigInt(publicPosition.collateral_deposited) - asBigInt(publicPosition.collateral_withdrawn);
    const availableCollateral = privatePosition
      ? asBigInt(privatePosition.collateral_available)
      : l1Available;

    if (availableCollateral < BigInt(amountLamports)) {
      throw new Error('Insufficient delegated collateral available for private trade');
    }

    const instructionProgram = this.createInstructionProgram(this.ephemeralConnection);
    const amount = new BN(amountLamports);
    const tx = new Transaction();

    if (!privatePositionInfo) {
      const initIx = await instructionProgram.methods
        .initializePrivatePositionState()
        .accountsPartial({
          trader: traderPubkey,
          config: configPda,
          market: marketPubkey,
          position: positionPda,
          privatePosition: privatePositionPda,
          magicProgram: MAGIC_PROGRAM_ID,
          magicContext: MAGIC_CONTEXT_ID,
        })
        .instruction();
      tx.add(initIx);
    }

    const buyIx = await instructionProgram.methods
      .placePrivatePrediction(amount, params.side === 'yes')
      .accountsPartial({
        trader: traderPubkey,
        config: configPda,
        market: marketPubkey,
        position: positionPda,
        privatePosition: privatePositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();
    tx.add(buyIx);

    const { blockhash } = await this.ephemeralConnection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = traderPubkey;

    return {
      transaction: tx,
      positionAddress: positionPda.toBase58(),
    };
  }

  async executeTrade(params: { market: string; side: 'yes' | 'no'; amount: bigint }) {
    const market = await this.getMarketInfo(params.market);
    if (!market) throw new Error('Market not found');

    const trader = await this.getPreferredOperatorKeypair();
    const walletAddress = trader.keypair.publicKey.toBase58();

    if (market.delegated) {
      try {
        const setup = await this.preparePositionSetupTransaction({
          market: params.market,
          amountUsdc: Number(params.amount) / 1_000_000,
          walletAddress,
        });
        await sendAndConfirmTransaction(this.connection, setup.transaction, [trader.keypair], {
          skipPreflight: false,
          commitment: 'confirmed',
        });

        await this.delegatePosition(params.market, walletAddress);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('already delegated in TEE')) {
          throw error;
        }
      }

      const privateTx = await this.preparePrivateTradeTransaction({
        market: params.market,
        side: params.side,
        amountUsdc: Number(params.amount) / 1_000_000,
        walletAddress,
      });

      const signature = await sendAndConfirmTransaction(
        this.ephemeralConnection,
        privateTx.transaction,
        [trader.keypair],
        {
          skipPreflight: true,
          commitment: 'confirmed',
        }
      );

      return { signature, signer: walletAddress, source: trader.source };
    }

    throw new Error(
      'Server-side transparent trading is not available after the MagicBlock migration. ' +
        'Delegate the market and position, then use private trading.'
    );
  }

  async createPrivacyMarket(params: {
    question: string;
    endTime: number;
    initialLiquidity: bigint;
  }) {
    const creator = await this.getPreferredOperatorKeypair();
    const config = await this.getProtocolConfig();
    const [configPda] = this.getConfigPda();

    const marketCountBuf = Buffer.alloc(8);
    marketCountBuf.writeBigUInt64LE(BigInt(config.marketCount));
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), marketCountBuf],
      PROGRAM_ID
    );

    const collateralMint = new PublicKey(config.collateralMint);
    const creatorCollateral = await getAssociatedTokenAddress(collateralMint, creator.keypair.publicKey);
    const vault = await getAssociatedTokenAddress(collateralMint, marketPda, true);
    const [creatorPositionPda] = this.getPositionPda(marketPda, creator.keypair.publicKey);
    const [creatorPrivatePositionPda] = this.getPrivatePositionStatePda(
      marketPda,
      creator.keypair.publicKey
    );
    const program = this.createProgramClient(this.connection, creator.keypair);

    const tx = new Transaction();
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        creator.keypair.publicKey,
        vault,
        marketPda,
        collateralMint
      )
    );

    const createIx = await program.methods
      .createPrivateMarket(
        params.question,
        new BN(params.endTime),
        new BN(params.initialLiquidity.toString())
      )
      .accounts({
        creator: creator.keypair.publicKey,
        config: configPda,
        market: marketPda,
        creatorPosition: creatorPositionPda,
        creatorPrivatePosition: creatorPrivatePositionPda,
        collateralMint,
        creatorCollateral,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    tx.add(createIx);
    tx.add(
      SystemProgram.transfer({
        fromPubkey: creator.keypair.publicKey,
        toPubkey: creatorPositionPda,
        lamports: ER_SPONSOR_BUFFER_LAMPORTS,
      }),
      SystemProgram.transfer({
        fromPubkey: creator.keypair.publicKey,
        toPubkey: creatorPrivatePositionPda,
        lamports: ER_SPONSOR_BUFFER_LAMPORTS,
      })
    );

    const latest = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;
    tx.feePayer = creator.keypair.publicKey;
    tx.sign(creator.keypair);

    const signature = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      'confirmed'
    );

    const delegation = await this.delegateMarket(marketPda.toBase58(), config.marketCount);
    const positionDelegation = await this.delegatePosition(
      marketPda.toBase58(),
      creator.keypair.publicKey.toBase58()
    );

    await this.delegatePrivatePosition(marketPda, creator.keypair.publicKey);

    const ephemeralProgram = this.createProgramClient(this.ephemeralConnection, creator.keypair, true);
    const initPrivateStateIx = await ephemeralProgram.methods
      .initializePrivateMarketState()
      .accountsPartial({
        creator: creator.keypair.publicKey,
        config: configPda,
        market: marketPda,
        creatorPosition: creatorPositionPda,
        privatePosition: creatorPrivatePositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const initPrivateStateSignature = await sendAndConfirmTransaction(
      this.ephemeralConnection,
      new Transaction().add(initPrivateStateIx),
      [creator.keypair],
      {
        skipPreflight: true,
        commitment: 'confirmed',
      }
    );

    const delegatedMarket = await this.getMarketInfo(marketPda.toBase58());

    return {
      marketAddress: marketPda.toBase58(),
      creatorPosition: creatorPositionPda.toBase58(),
      signature,
      txHash: signature,
      delegated: delegatedMarket?.delegated || false,
      delegationSignature: delegation.signature,
      creatorPositionDelegationSignature: positionDelegation.signature,
      privateStateInitializationSignature: initPrivateStateSignature,
      creator: creator.keypair.publicKey.toBase58(),
      creatorSource: creator.source,
    };
  }

  async delegateMarket(marketAddress: string, marketId?: number) {
    const marketPubkey = new PublicKey(marketAddress);
    const currentInfo = await this.connection.getAccountInfo(marketPubkey, 'confirmed');
    if (!currentInfo) throw new Error('Market account not found');
    if (currentInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
      return { signature: null, alreadyDelegated: true };
    }

    const config = await this.getProtocolConfig();
    const admin = await this.requireMatchingKeypair(config.admin, 'admin');
    const program = this.createProgramClient(this.connection, admin.keypair);
    const derivedId = marketId ?? asNumber(this.decodeMarketAccount(currentInfo.data).id);

    const bufferMarket = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(marketPubkey, PROGRAM_ID);
    const delegationRecordMarket = delegationRecordPdaFromDelegatedAccount(marketPubkey);
    const delegationMetadataMarket = delegationMetadataPdaFromDelegatedAccount(marketPubkey);
    const [configPda] = this.getConfigPda();
    const marketPermission = permissionPdaFromAccount(marketPubkey);

    try {
      const createMarketPermissionIx = await program.methods
        .createMarketPermission()
        .accounts({
          authority: admin.keypair.publicKey,
          config: configPda,
          market: marketPubkey,
          permission: marketPermission,
          permissionProgram: PERMISSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      await sendAndConfirmTransaction(
        this.connection,
        new Transaction().add(createMarketPermissionIx),
        [admin.keypair],
        { commitment: 'confirmed' }
      );
    } catch (error) {
      const message = (error as Error).message || '';
      if (!message.includes('already') && !message.includes('in use')) {
        throw error;
      }
    }

    const delegatePermissionIx = createDelegatePermissionInstruction({
      payer: admin.keypair.publicKey,
      authority: [admin.keypair.publicKey, true],
      permissionedAccount: [marketPubkey, false],
      ownerProgram: PERMISSION_PROGRAM_ID,
      validator: new PublicKey(config.teeValidator),
    });

    const delegateMarketIx = await program.methods
      .delegateMarketIntoTee(new BN(derivedId))
      .accounts({
        authority: admin.keypair.publicKey,
        config: configPda,
        bufferMarket,
        delegationRecordMarket,
        delegationMetadataMarket,
        market: marketPubkey,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const signature = await sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(delegatePermissionIx, delegateMarketIx),
      [admin.keypair],
      { commitment: 'confirmed' }
    );

    return { signature, alreadyDelegated: false, admin: admin.keypair.publicKey.toBase58() };
  }

  async delegatePosition(marketAddress: string, traderAddress: string) {
    const marketPubkey = new PublicKey(marketAddress);
    const traderPubkey = new PublicKey(traderAddress);
    const [positionPda] = this.getPositionPda(marketPubkey, traderPubkey);
    const [privatePositionPda] = this.getPrivatePositionStatePda(marketPubkey, traderPubkey);
    const currentInfo = await this.connection.getAccountInfo(positionPda, 'confirmed');
    if (!currentInfo) throw new Error('Position account not found');
    const privateCurrentInfo = await this.connection.getAccountInfo(privatePositionPda, 'confirmed');
    if (!privateCurrentInfo) throw new Error('Private position account not found');

    const config = await this.getProtocolConfig();
    const admin = await this.requireMatchingKeypair(config.admin, 'admin');
    const program = this.createProgramClient(this.connection, admin.keypair);
    const [configPda] = this.getConfigPda();

    let positionSignature: string | null = null;
    let privatePositionSignature: string | null = null;

    if (!currentInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
      const bufferPosition = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(positionPda, PROGRAM_ID);
      const delegationRecordPosition = delegationRecordPdaFromDelegatedAccount(positionPda);
      const delegationMetadataPosition = delegationMetadataPdaFromDelegatedAccount(positionPda);
      const positionPermission = permissionPdaFromAccount(positionPda);

      try {
        const createPositionPermissionIx = await program.methods
          .createPositionPermission()
          .accounts({
            authority: admin.keypair.publicKey,
            config: configPda,
            position: positionPda,
            permission: positionPermission,
            permissionProgram: PERMISSION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction();

        await sendAndConfirmTransaction(
          this.connection,
          new Transaction().add(createPositionPermissionIx),
          [admin.keypair],
          { commitment: 'confirmed' }
        );
      } catch (error) {
        const message = (error as Error).message || '';
        if (!message.includes('already') && !message.includes('in use')) {
          throw error;
        }
      }

      const delegatePermissionIx = createDelegatePermissionInstruction({
        payer: admin.keypair.publicKey,
        authority: [admin.keypair.publicKey, true],
        permissionedAccount: [positionPda, false],
        ownerProgram: PERMISSION_PROGRAM_ID,
        validator: new PublicKey(config.teeValidator),
      });

      const delegatePositionIx = await program.methods
        .delegatePositionIntoTee(marketPubkey, traderPubkey)
        .accounts({
          authority: admin.keypair.publicKey,
          config: configPda,
          bufferPosition,
          delegationRecordPosition,
          delegationMetadataPosition,
          position: positionPda,
          ownerProgram: PROGRAM_ID,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      positionSignature = await sendAndConfirmTransaction(
        this.connection,
        new Transaction().add(delegatePermissionIx, delegatePositionIx),
        [admin.keypair],
        { commitment: 'confirmed' }
      );
    }

    if (!privateCurrentInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
      const bufferPrivatePosition = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
        privatePositionPda,
        PROGRAM_ID
      );
      const delegationRecordPrivatePosition = delegationRecordPdaFromDelegatedAccount(privatePositionPda);
      const delegationMetadataPrivatePosition = delegationMetadataPdaFromDelegatedAccount(privatePositionPda);
      const privatePositionPermission = permissionPdaFromAccount(privatePositionPda);

      try {
        const createPrivatePositionPermissionIx = await program.methods
          .createPrivatePositionPermission()
          .accounts({
            authority: admin.keypair.publicKey,
            config: configPda,
            privatePosition: privatePositionPda,
            permission: privatePositionPermission,
            permissionProgram: PERMISSION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction();

        await sendAndConfirmTransaction(
          this.connection,
          new Transaction().add(createPrivatePositionPermissionIx),
          [admin.keypair],
          { commitment: 'confirmed' }
        );
      } catch (error) {
        const message = (error as Error).message || '';
        if (!message.includes('already') && !message.includes('in use')) {
          throw error;
        }
      }

      const delegatePrivatePermissionIx = createDelegatePermissionInstruction({
        payer: admin.keypair.publicKey,
        authority: [admin.keypair.publicKey, true],
        permissionedAccount: [privatePositionPda, false],
        ownerProgram: PERMISSION_PROGRAM_ID,
        validator: new PublicKey(config.teeValidator),
      });

      const delegatePrivatePositionIx = await program.methods
        .delegatePrivatePositionIntoTee(marketPubkey, traderPubkey)
        .accounts({
          authority: admin.keypair.publicKey,
          config: configPda,
          bufferPrivatePosition,
          delegationRecordPrivatePosition,
          delegationMetadataPrivatePosition,
          privatePosition: privatePositionPda,
          ownerProgram: PROGRAM_ID,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      privatePositionSignature = await sendAndConfirmTransaction(
        this.connection,
        new Transaction().add(delegatePrivatePermissionIx, delegatePrivatePositionIx),
        [admin.keypair],
        { commitment: 'confirmed' }
      );
    }

    return {
      signature: privatePositionSignature || positionSignature,
      positionDelegationSignature: positionSignature,
      privatePositionDelegationSignature: privatePositionSignature,
      alreadyDelegated: !positionSignature && !privatePositionSignature,
      positionAddress: positionPda.toBase58(),
      privatePositionAddress: privatePositionPda.toBase58(),
    };
  }

  private async delegatePrivatePosition(marketPubkey: PublicKey, traderPubkey: PublicKey) {
    const [privatePositionPda] = this.getPrivatePositionStatePda(marketPubkey, traderPubkey);
    const currentInfo = await this.connection.getAccountInfo(privatePositionPda, 'confirmed');
    if (!currentInfo) throw new Error('Private position account not found');
    if (currentInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
      return { signature: null, alreadyDelegated: true, privatePositionAddress: privatePositionPda.toBase58() };
    }

    const config = await this.getProtocolConfig();
    const admin = await this.requireMatchingKeypair(config.admin, 'admin');
    const program = this.createProgramClient(this.connection, admin.keypair);
    const [configPda] = this.getConfigPda();

    const bufferPrivatePosition = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
      privatePositionPda,
      PROGRAM_ID
    );
    const delegationRecordPrivatePosition = delegationRecordPdaFromDelegatedAccount(privatePositionPda);
    const delegationMetadataPrivatePosition = delegationMetadataPdaFromDelegatedAccount(privatePositionPda);
    const privatePositionPermission = permissionPdaFromAccount(privatePositionPda);

    try {
      const createPrivatePositionPermissionIx = await program.methods
        .createPrivatePositionPermission()
        .accounts({
          authority: admin.keypair.publicKey,
          config: configPda,
          privatePosition: privatePositionPda,
          permission: privatePositionPermission,
          permissionProgram: PERMISSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      await sendAndConfirmTransaction(
        this.connection,
        new Transaction().add(createPrivatePositionPermissionIx),
        [admin.keypair],
        { commitment: 'confirmed' }
      );
    } catch (error) {
      const message = (error as Error).message || '';
      if (!message.includes('already') && !message.includes('in use')) {
        throw error;
      }
    }

    const delegatePrivatePermissionIx = createDelegatePermissionInstruction({
      payer: admin.keypair.publicKey,
      authority: [admin.keypair.publicKey, true],
      permissionedAccount: [privatePositionPda, false],
      ownerProgram: PERMISSION_PROGRAM_ID,
      validator: new PublicKey(config.teeValidator),
    });

    const delegatePrivatePositionIx = await program.methods
      .delegatePrivatePositionIntoTee(marketPubkey, traderPubkey)
      .accounts({
        authority: admin.keypair.publicKey,
        config: configPda,
        bufferPrivatePosition,
        delegationRecordPrivatePosition,
        delegationMetadataPrivatePosition,
        privatePosition: privatePositionPda,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const signature = await sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(delegatePrivatePermissionIx, delegatePrivatePositionIx),
      [admin.keypair],
      { commitment: 'confirmed' }
    );

    return {
      signature,
      alreadyDelegated: false,
      privatePositionAddress: privatePositionPda.toBase58(),
    };
  }

  async resolveMarketAndCommit(marketAddress: string, outcome: 'yes' | 'no') {
    const market = await this.getMarketInfo(marketAddress);
    if (!market) throw new Error('Market not found');

    const config = await this.getProtocolConfig();
    const oracle = await this.requireMatchingKeypair(config.oracle, 'oracle');
    const admin = await this.requireMatchingKeypair(config.admin, 'admin');
    const [configPda] = this.getConfigPda();
    const marketPubkey = new PublicKey(marketAddress);

    if (!market.delegated) {
      throw new Error('Resolve flow only supports delegated MagicBlock markets in the new IDL');
    }

    const ephemeralProgram = this.createProgramClient(this.ephemeralConnection, oracle.keypair, true);
    const resolveSignature = await ephemeralProgram.methods
      .resolvePrivateMarketEr(outcome === 'yes')
      .accountsPartial({
        oracle: oracle.keypair.publicKey,
        config: configPda,
        market: marketPubkey,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .rpc();

    const adminEphemeralProgram = this.createProgramClient(this.ephemeralConnection, admin.keypair, true);
    const commitSignature = await adminEphemeralProgram.methods
      .commitAndUndelegate()
      .accountsPartial({
        authority: admin.keypair.publicKey,
        config: configPda,
        market: marketPubkey,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .rpc();

    return { resolveSignature, commitSignature };
  }

  async isV3Market(marketAddress: string): Promise<boolean> {
    const market = await this.getMarketInfo(marketAddress);
    return Boolean(market?.delegated);
  }

  private getConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
  }

  private getMarketPdaById(marketId: number): [PublicKey, number] {
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(BigInt(marketId));
    return PublicKey.findProgramAddressSync([Buffer.from('market'), idBuf], PROGRAM_ID);
  }

  private getPositionPda(market: PublicKey, trader: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('position'), market.toBuffer(), trader.toBuffer()],
      PROGRAM_ID
    );
  }

  private getPrivateMarketStatePda(market: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('private_market_state'), market.toBuffer()],
      PROGRAM_ID
    );
  }

  private getPrivatePositionStatePda(market: PublicKey, trader: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('private_position_state'), market.toBuffer(), trader.toBuffer()],
      PROGRAM_ID
    );
  }

  private decodeMarketAccount(data: Buffer) {
    return MarketLayout.decode(data.subarray(8)) as LayoutDecoded;
  }

  private decodePositionAccount(data: Buffer) {
    return PositionLayout.decode(data.subarray(8)) as LayoutDecoded;
  }

  private decodePrivateMarketState(data: Buffer) {
    return PrivateMarketStateLayout.decode(data) as LayoutDecoded;
  }

  private decodePrivatePositionState(data: Buffer) {
    return PrivatePositionStateLayout.decode(data) as LayoutDecoded;
  }

  private async fetchPrivateMarketState(market: PublicKey, owner: PublicKey) {
    if (!owner.equals(DELEGATION_PROGRAM_ID)) return null;

    const [marketStatePda] = this.getPrivateMarketStatePda(market);
    const info = await this.ephemeralConnection.getAccountInfo(marketStatePda, 'confirmed');
    if (!info) return null;

    try {
      return this.decodePrivateMarketState(info.data);
    } catch {
      return null;
    }
  }

  private async fetchPrivatePositionState(market: PublicKey, trader: PublicKey) {
    const [privatePositionPda] = this.getPrivatePositionStatePda(market, trader);
    const info = await this.ephemeralConnection.getAccountInfo(privatePositionPda, 'confirmed');
    if (!info) return null;

    try {
      return this.decodePrivatePositionState(info.data);
    } catch {
      return null;
    }
  }

  private normalizeMarket(
    publicKey: PublicKey,
    account: LayoutDecoded,
    owner: PublicKey,
    privateState: LayoutDecoded | null
  ): NormalizedMarket {
    const status = asNumber(account.status);
    const outcome = asNumber(account.outcome);
    const endTimeNum = asNumber(account.end_time);
    const nowSec = Math.floor(Date.now() / 1000);
    const delegated = owner.equals(DELEGATION_PROGRAM_ID);
    const resolved = status >= 2 || outcome !== 0;
    const positionsHidden = delegated && !resolved;

    const fallbackPool = Math.max(asNumber(account.total_deposited), 1_000_000);
    const reserves = privateState ? asNumber(privateState.reserves) : asNumber(account.final_reserves) || fallbackPool;
    const yesSupply = privateState ? asNumber(privateState.yes_supply) : Math.max(Math.floor(fallbackPool / 2), 1);
    const noSupply = privateState ? asNumber(privateState.no_supply) : Math.max(Math.floor(fallbackPool / 2), 1);

    const visibleYesSupply = positionsHidden ? '0' : yesSupply.toString(16);
    const visibleNoSupply = positionsHidden ? '0' : noSupply.toString(16);
    const visibleReserves = positionsHidden ? '0' : reserves.toString(16);

    const outcomeStr = outcome === 1 ? 'yes' : outcome === 2 ? 'no' : outcome === 3 ? 'invalid' : 'undetermined';

    return {
      publicKey: publicKey.toBase58(),
      delegated,
      ownerProgram: owner.toBase58(),
      privacyMode: positionsHidden ? 'shielded' : 'transparent',
      positionsHidden,
      settlementState: delegated ? 'delegated' : 'base',
      privacyNote: delegated
        ? 'This market is delegated into MagicBlock. Live positions and pricing stay inside PER until resolution.'
        : 'This shell is visible on Solana, but private live-state trading only works after MagicBlock delegation.',
      account: {
        id: asBigInt(account.id).toString(),
        question: String(account.question || ''),
        resolved,
        resolvable: !resolved && endTimeNum <= nowSec,
        creator: pk(account.creator),
        end_time: endTimeNum.toString(16),
        creation_time: asNumber(account.created_at).toString(16),
        initial_liquidity: asNumber(account.total_deposited).toString(16),
        yes_token_mint: pk(account.vault),
        no_token_mint: pk(account.vault),
        yes_token_supply_minted: visibleYesSupply,
        no_token_supply_minted: visibleNoSupply,
        collateral_token: pk(account.collateral_mint),
        market_reserves: visibleReserves,
        winning_token_id: resolved
          ? { Some: outcomeStr }
          : { None: {} as Record<string, never> },
      },
    };
  }

  private normalizePosition(
    publicKey: PublicKey,
    account: LayoutDecoded,
    owner: PublicKey,
    privateState: LayoutDecoded | null
  ): NormalizedPosition {
    const collateralDeposited = asBigInt(account.collateral_deposited);
    const collateralWithdrawn = asBigInt(account.collateral_withdrawn);
    const l1Available = collateralDeposited > collateralWithdrawn
      ? collateralDeposited - collateralWithdrawn
      : BigInt(0);

    return {
      publicKey: publicKey.toBase58(),
      delegated: owner.equals(DELEGATION_PROGRAM_ID),
      market: pk(account.market),
      trader: pk(account.trader),
      collateralDeposited: collateralDeposited.toString(),
      collateralAvailable: privateState
        ? asBigInt(privateState.collateral_available).toString()
        : l1Available.toString(),
      yesShares: privateState ? asBigInt(privateState.yes_shares).toString() : '0',
      noShares: privateState ? asBigInt(privateState.no_shares).toString() : '0',
      claimed: boolFromU8(account.claimed),
      bump: asNumber(account.bump),
    };
  }

  private normalizeEphemeralIx(
    ix: TransactionInstruction,
    options: {
      readonly?: PublicKey[];
      writable?: PublicKey[];
    }
  ) {
    const readonly = options.readonly ?? [];
    const writable = options.writable ?? [];

    ix.keys = ix.keys.map((key) => {
      if (writable.some((pubkey) => key.pubkey.equals(pubkey))) {
        return { ...key, isWritable: true };
      }

      if (readonly.some((pubkey) => key.pubkey.equals(pubkey))) {
        return { ...key, isWritable: false };
      }

      return key;
    });

    return ix;
  }

  private createProgramClient(connection: Connection, keypair: Keypair, skipPreflight = false) {
    const provider = new AnchorProvider(
      connection,
      new NodeWallet(keypair),
      {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
        skipPreflight,
      }
    );
    return new Program(this.idl as any, provider);
  }

  private createInstructionProgram(connection: Connection) {
    return this.createProgramClient(connection, getDefaultKeypair()?.keypair || Keypair.generate());
  }

  private async getPreferredOperatorKeypair(): Promise<LoadedKeypair> {
    return (
      getDefaultKeypair() ||
      (() => {
        throw new Error('No local Solana keypair available for backend operations');
      })()
    );
  }

  private async requireMatchingKeypair(publicKey: string, role: 'admin' | 'oracle'): Promise<LoadedKeypair> {
    const match = findKeypairByPublicKey(publicKey);
    if (!match) {
      throw new Error(`No local keypair matches on-chain ${role} ${publicKey}`);
    }
    return match;
  }

  async commitPosition(marketAddress: string, traderAddress: string) {
    const marketPubkey = new PublicKey(marketAddress);
    const traderPubkey = new PublicKey(traderAddress);
    const [configPda] = this.getConfigPda();
    const [positionPda] = this.getPositionPda(marketPubkey, traderPubkey);
    
    const config = await this.getProtocolConfig();
    const admin = await this.requireMatchingKeypair(config.admin, 'admin');

    const adminEphemeralProgram = this.createProgramClient(this.ephemeralConnection, admin.keypair, true);
    
    const commitSignature = await adminEphemeralProgram.methods
      .commitPositionAndUndelegate()
      .accountsPartial({
        authority: admin.keypair.publicKey,
        config: configPda,
        position: positionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .rpc();

    return { commitSignature };
  }

  async prepareSettleTransaction(params: {
    market: string;
    walletAddress: string;
  }): Promise<{ transaction: Transaction; positionAddress: string }> {
    const marketPubkey = new PublicKey(params.market);
    const traderPubkey = new PublicKey(params.walletAddress);
    const [configPda] = this.getConfigPda();
    const [positionPda] = this.getPositionPda(marketPubkey, traderPubkey);
    const [privatePositionPda] = this.getPrivatePositionStatePda(marketPubkey, traderPubkey);

    const market = await this.getMarketInfo(params.market);
    if (!market) throw new Error('Market not found');
    if (!market.delegated) throw new Error('Market is not delegated into MagicBlock TEE');

    const instructionProgram = this.createInstructionProgram(this.ephemeralConnection);
    const tx = new Transaction();

    const ix = await instructionProgram.methods
      .settlePrivatePositionEr()
      .accountsPartial({
        trader: traderPubkey,
        config: configPda,
        market: marketPubkey,
        position: positionPda,
        privatePosition: privatePositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    tx.add(ix);

    const latestBlockhash = await this.ephemeralConnection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = traderPubkey;

    return { transaction: tx, positionAddress: positionPda.toBase58() };
  }

  async prepareClaimTransaction(params: {
    market: string;
    walletAddress: string;
  }): Promise<{ transaction: Transaction }> {
    const marketPubkey = new PublicKey(params.market);
    const traderPubkey = new PublicKey(params.walletAddress);
    const [configPda] = this.getConfigPda();
    const [positionPda] = this.getPositionPda(marketPubkey, traderPubkey);

    const config = await this.getProtocolConfig();
    const vaultAta = await getAssociatedTokenAddress(new PublicKey(config.collateralMint), marketPubkey, true);
    const traderCollateralAta = await getAssociatedTokenAddress(new PublicKey(config.collateralMint), traderPubkey);

    const instructionProgram = this.createInstructionProgram(this.connection);
    const tx = new Transaction();

    const ix = await instructionProgram.methods
      .claimSettledPrivatePosition()
      .accountsPartial({
        trader: traderPubkey,
        config: configPda,
        market: marketPubkey,
        position: positionPda,
        collateralMint: new PublicKey(config.collateralMint),
        traderCollateral: traderCollateralAta,
        vault: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    tx.add(ix);

    const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = traderPubkey;

    return { transaction: tx };
  }
}

export const coreService = new MagicBlockIndexer();
