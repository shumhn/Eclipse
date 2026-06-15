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
  getAuthToken,
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
  createMintToInstruction,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { findKeypairByPublicKey, getDefaultKeypair, LoadedKeypair } from './solana-wallets';

const PROGRAM_ID = new PublicKey('79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t');
const MAGIC_PROGRAM_ID = new PublicKey('Magic11111111111111111111111111111111111111');
const MAGIC_CONTEXT_ID = new PublicKey('MagicContext1111111111111111111111111111111');
const EPHEMERAL_RPC_URL = 'https://devnet-tee.magicblock.app';
const MAGICBLOCK_READ_RPC_URL = 'https://devnet.magicblock.app';
const ER_SPONSOR_BUFFER_LAMPORTS = 100_000;
const MARKET_SCAN_LIMIT = Number(process.env.MARKET_SCAN_LIMIT || 64);
const POSITION_ACCOUNT_SIZE = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 1;
const MAGICBLOCK_SOL_USD_FEED = new PublicKey('ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu');
const MAGICBLOCK_BTC_USD_FEED = new PublicKey('71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr');
const MAGICBLOCK_PRICE_FEEDS: Record<'SOLUSD' | 'BTCUSD', PublicKey> = {
  SOLUSD: MAGICBLOCK_SOL_USD_FEED,
  BTCUSD: MAGICBLOCK_BTC_USD_FEED,
};

const MarketLayout = borsh.struct([
  borsh.u64('id'),
  borsh.publicKey('creator'),
  borsh.str('question'),
  borsh.u64('end_time'),
  borsh.u64('created_at'),
  borsh.publicKey('collateral_mint'),
  borsh.publicKey('vault'),
  borsh.u64('total_deposited'),
  borsh.u64('live_reserves'),
  borsh.u64('live_yes_supply'),
  borsh.u64('live_no_supply'),
  borsh.u64('final_reserves'),
  borsh.u64('total_claimable_settled'),
  borsh.u64('total_claimed'),
  borsh.u8('status'),
  borsh.u8('outcome'),
  borsh.u8('oracle_kind'),
  borsh.u8('price_direction'),
  borsh.i64('target_price'),
  borsh.publicKey('oracle_feed'),
  borsh.i64('resolver_price'),
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
  tradingEnabled?: boolean;
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
  priceMarket?: {
    asset: 'SOL/USD' | 'BTC/USD' | 'Unknown';
    targetPriceUsd: number | null;
    currentPriceUsd: number | null;
    resolverPriceUsd: number | null;
    direction: 'above' | 'below';
    rule: string;
    oracleFeed?: string;
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
    oracle_kind?: 'manual' | 'pythPrice';
    price_direction?: 'above' | 'below';
    target_price?: string;
    oracle_feed?: string;
    resolver_price?: string;
  };
}

export interface NormalizedPosition {
  publicKey: string;
  delegated: boolean;
  market: string;
  trader: string;
  collateralDeposited: string;
  collateralWithdrawn: string;
  collateralAvailable: string;
  yesShares: string;
  noShares: string;
  claimableAmount: string;
  claimedAmount: string;
  settled: boolean;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MagicBlockIndexer {
  private readonly connection: Connection;
  private readonly ephemeralConnection: Connection;
  private readonly magicblockReadConnection: Connection;
  private readonly idl: Record<string, any>;
  private readonly marketDiscriminator: Buffer;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.ephemeralConnection = new Connection(EPHEMERAL_RPC_URL, 'confirmed');
    this.magicblockReadConnection = new Connection(MAGICBLOCK_READ_RPC_URL, 'confirmed');
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

  async getAllMarkets(options?: {
    attachPriceData?: boolean;
    fetchPrivateState?: boolean;
  }): Promise<{ count: number; data: NormalizedMarket[] }> {
    const attachPriceData = options?.attachPriceData ?? true;
    const fetchPrivateState = options?.fetchPrivateState ?? true;
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
          const privateState = fetchPrivateState
            ? await this.fetchPrivateMarketState(pubkey, account.owner)
            : null;
          const normalized = this.normalizeMarket(pubkey, decoded, account.owner, privateState);
          return attachPriceData ? await this.attachPriceMarketData(normalized) : normalized;
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
      const normalized = this.normalizeMarket(pubkey, decoded, info.owner, privateState);
      return await this.attachPriceMarketData(normalized);
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
    this.assertMarketTradeable(marketInfo);

    const positionInfo = await this.connection.getAccountInfo(positionPda, 'confirmed');
    if (positionInfo?.owner.equals(DELEGATION_PROGRAM_ID)) {
      throw new Error('Position already delegated in TEE; additional base deposits are not supported yet');
    }

    const collateralMint = new PublicKey(marketInfo.account.collateral_token);
    const traderCollateral = await getAssociatedTokenAddress(collateralMint, traderPubkey);
    const vault = new PublicKey(marketInfo.account.yes_token_mint);
    const amount = new BN(Math.round(params.amountUsdc * 1_000_000));

    let traderCollateralBalance = BigInt(0);
    try {
      const traderCollateralAccount = await getAccount(
        this.connection,
        traderCollateral,
        'confirmed',
        TOKEN_PROGRAM_ID
      );
      traderCollateralBalance = traderCollateralAccount.amount;
    } catch {
      traderCollateralBalance = BigInt(0);
    }

    if (traderCollateralBalance < BigInt(amount.toString())) {
      throw new Error(
        `This market uses collateral mint ${collateralMint.toBase58()}. ` +
          `Your wallet only has ${(Number(traderCollateralBalance) / 1_000_000).toFixed(2)} of that mint, ` +
          `so the ${params.amountUsdc.toFixed(2)} USDC trade cannot be funded. ` +
          `If Phantom shows an "Unknown Token", it may be a different devnet USDC mint.`
      );
    }

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
      createAssociatedTokenAccountIdempotentInstruction(
        traderPubkey,
        traderCollateral,
        traderPubkey,
        collateralMint
      )
    );

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
    this.assertMarketTradeable(market);

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

      const authenticatedEphemeralConnection =
        await this.createAuthenticatedEphemeralConnection(trader.keypair);
      const signature = await sendAndConfirmTransaction(
        authenticatedEphemeralConnection,
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
    oracleKind?: 'manual' | 'pythPrice';
    oracleAsset?: 'SOLUSD' | 'BTCUSD';
    targetPrice?: bigint;
    priceDirection?: 'above' | 'below';
    oracleFeed?: string;
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
    await this.ensureCreatorCollateralForMarket(
      collateralMint,
      creator,
      creatorCollateral,
      params.initialLiquidity
    );

    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        creator.keypair.publicKey,
        vault,
        marketPda,
        collateralMint
      )
    );

    const createMethod = params.oracleKind === 'pythPrice'
      ? program.methods.createPriceMarket(
          params.question,
          new BN(params.endTime),
          new BN(params.initialLiquidity.toString()),
          new BN((params.targetPrice ?? BigInt(0)).toString()),
          params.priceDirection === 'below' ? { below: {} } : { above: {} },
          params.oracleFeed
            ? new PublicKey(params.oracleFeed)
            : MAGICBLOCK_PRICE_FEEDS[params.oracleAsset ?? 'SOLUSD']
        )
      : program.methods.createPrivateMarket(
          params.question,
          new BN(params.endTime),
          new BN(params.initialLiquidity.toString())
        );

    const createIx = await createMethod
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

    const authenticatedEphemeralConnection =
      await this.createAuthenticatedEphemeralConnection(creator.keypair);
    const ephemeralProgram = this.createProgramClient(
      authenticatedEphemeralConnection,
      creator.keypair,
      true
    );
    const initPrivateStateIx = await ephemeralProgram.methods
      .initializePrivateMarketState()
      .accountsPartial({
        initializer: creator.keypair.publicKey,
        config: configPda,
        market: marketPda,
        creatorPosition: creatorPositionPda,
        privatePosition: creatorPrivatePositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const initPrivateStateSignature = await sendAndConfirmTransaction(
      authenticatedEphemeralConnection,
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

  async prepareCreateMarketTransaction(params: {
    walletAddress: string;
    question: string;
    endTime: number;
    initialLiquidity: bigint;
    oracleKind?: 'manual' | 'pythPrice';
    oracleAsset?: 'SOLUSD' | 'BTCUSD';
    targetPrice?: bigint;
    priceDirection?: 'above' | 'below';
    oracleFeed?: string;
  }) {
    const creatorPubkey = new PublicKey(params.walletAddress);
    const config = await this.getProtocolConfig();
    const [configPda] = this.getConfigPda();

    const marketCountBuf = Buffer.alloc(8);
    marketCountBuf.writeBigUInt64LE(BigInt(config.marketCount));
    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), marketCountBuf],
      PROGRAM_ID
    );

    const collateralMint = new PublicKey(config.collateralMint);
    const creatorCollateral = await getAssociatedTokenAddress(collateralMint, creatorPubkey);
    const vault = await getAssociatedTokenAddress(collateralMint, marketPda, true);
    const [creatorPositionPda] = this.getPositionPda(marketPda, creatorPubkey);
    const [creatorPrivatePositionPda] = this.getPrivatePositionStatePda(marketPda, creatorPubkey);
    const program = this.createInstructionProgram(this.connection);

    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        creatorPubkey,
        creatorCollateral,
        creatorPubkey,
        collateralMint
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        creatorPubkey,
        vault,
        marketPda,
        collateralMint
      )
    );

    const createMethod = params.oracleKind === 'pythPrice'
      ? program.methods.createPriceMarket(
          params.question,
          new BN(params.endTime),
          new BN(params.initialLiquidity.toString()),
          new BN((params.targetPrice ?? BigInt(0)).toString()),
          params.priceDirection === 'below' ? { below: {} } : { above: {} },
          params.oracleFeed
            ? new PublicKey(params.oracleFeed)
            : MAGICBLOCK_PRICE_FEEDS[params.oracleAsset ?? 'SOLUSD']
        )
      : program.methods.createPrivateMarket(
          params.question,
          new BN(params.endTime),
          new BN(params.initialLiquidity.toString())
        );

    const createIx = await createMethod
      .accounts({
        creator: creatorPubkey,
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

    tx.add(
      createIx,
      SystemProgram.transfer({
        fromPubkey: creatorPubkey,
        toPubkey: creatorPositionPda,
        lamports: ER_SPONSOR_BUFFER_LAMPORTS,
      }),
      SystemProgram.transfer({
        fromPubkey: creatorPubkey,
        toPubkey: creatorPrivatePositionPda,
        lamports: ER_SPONSOR_BUFFER_LAMPORTS,
      })
    );

    const latest = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;
    tx.feePayer = creatorPubkey;

    return {
      transaction: tx,
      marketAddress: marketPda.toBase58(),
      creatorPosition: creatorPositionPda.toBase58(),
      creatorPrivatePosition: creatorPrivatePositionPda.toBase58(),
      vault: vault.toBase58(),
      collateralMint: collateralMint.toBase58(),
      marketId: config.marketCount,
    };
  }

  async finalizeMarketCreation(params: {
    marketAddress: string;
    walletAddress: string;
  }) {
    const marketPubkey = new PublicKey(params.marketAddress);
    const creatorPubkey = new PublicKey(params.walletAddress);
    const market = await this.getMarketInfo(params.marketAddress);
    if (!market) throw new Error('Market account not found after creation');
    if (market.account.creator !== creatorPubkey.toBase58()) {
      throw new Error('Wallet does not match the on-chain market creator');
    }

    const config = await this.getProtocolConfig();
    const admin = await this.requireMatchingKeypair(config.admin, 'admin');
    const [configPda] = this.getConfigPda();
    const [creatorPositionPda] = this.getPositionPda(marketPubkey, creatorPubkey);
    const [creatorPrivatePositionPda] = this.getPrivatePositionStatePda(marketPubkey, creatorPubkey);

    const delegation = await this.delegateMarket(params.marketAddress, Number(market.account.id));
    const positionDelegation = await this.delegatePosition(
      params.marketAddress,
      creatorPubkey.toBase58()
    );

    await this.delegatePrivatePosition(marketPubkey, creatorPubkey);

    const authenticatedEphemeralConnection =
      await this.createAuthenticatedEphemeralConnection(admin.keypair);
    const ephemeralProgram = this.createProgramClient(
      authenticatedEphemeralConnection,
      admin.keypair,
      true
    );
    const initPrivateStateIx = await ephemeralProgram.methods
      .initializePrivateMarketState()
      .accountsPartial({
        initializer: admin.keypair.publicKey,
        config: configPda,
        market: marketPubkey,
        creatorPosition: creatorPositionPda,
        privatePosition: creatorPrivatePositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const initPrivateStateSignature = await sendAndConfirmTransaction(
      authenticatedEphemeralConnection,
      new Transaction().add(initPrivateStateIx),
      [admin.keypair],
      {
        skipPreflight: true,
        commitment: 'confirmed',
      }
    );

    const delegatedMarket = await this.getMarketInfo(params.marketAddress);

    return {
      marketAddress: params.marketAddress,
      creatorPosition: creatorPositionPda.toBase58(),
      delegated: delegatedMarket?.delegated || false,
      delegationSignature: delegation.signature,
      creatorPositionDelegationSignature: positionDelegation.signature,
      privateStateInitializationSignature: initPrivateStateSignature,
      creator: creatorPubkey.toBase58(),
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

  private async ensureCreatorCollateralForMarket(
    collateralMint: PublicKey,
    creator: LoadedKeypair,
    creatorCollateral: PublicKey,
    requiredAmount: bigint
  ) {
    const setupTx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        creator.keypair.publicKey,
        creatorCollateral,
        creator.keypair.publicKey,
        collateralMint
      )
    );

    await sendAndConfirmTransaction(this.connection, setupTx, [creator.keypair], {
      commitment: 'confirmed',
    });

    const tokenAccount = await getAccount(
      this.connection,
      creatorCollateral,
      'confirmed',
      TOKEN_PROGRAM_ID
    );

    if (tokenAccount.amount >= requiredAmount) {
      return;
    }

    const mintInfo = await getMint(
      this.connection,
      collateralMint,
      'confirmed',
      TOKEN_PROGRAM_ID
    );

    const mintAuthority = mintInfo.mintAuthority
      ? findKeypairByPublicKey(mintInfo.mintAuthority)
      : null;

    if (!mintAuthority) {
      const missing = requiredAmount - tokenAccount.amount;
      throw new Error(
        `Creator needs ${missing.toString()} more collateral units before creating this market.`
      );
    }

    const mintTx = new Transaction().add(
      createMintToInstruction(
        collateralMint,
        creatorCollateral,
        mintAuthority.keypair.publicKey,
        requiredAmount - tokenAccount.amount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(this.connection, mintTx, [mintAuthority.keypair], {
      commitment: 'confirmed',
    });
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
    const [configPda] = this.getConfigPda();
    const marketPubkey = new PublicKey(marketAddress);

    if (!market.delegated) {
      throw new Error('Resolve flow only supports delegated MagicBlock markets in the new IDL');
    }

    const authenticatedEphemeralConnection =
      await this.createAuthenticatedEphemeralConnection(oracle.keypair);
    const ephemeralProgram = this.createProgramClient(authenticatedEphemeralConnection, oracle.keypair, true);
    const oracleKind = market.account.oracle_kind || 'manual';
    const resolveIx =
      oracleKind === 'pythPrice'
        ? await ephemeralProgram.methods
            .resolvePriceMarketEr()
            .accountsPartial({
              resolver: oracle.keypair.publicKey,
              config: configPda,
              market: marketPubkey,
              oracleFeed: new PublicKey(market.account.oracle_feed || MAGICBLOCK_SOL_USD_FEED.toBase58()),
              magicProgram: MAGIC_PROGRAM_ID,
              magicContext: MAGIC_CONTEXT_ID,
            })
            .instruction()
        : await ephemeralProgram.methods
            .resolvePrivateMarketEr(outcome === 'yes')
            .accountsPartial({
              oracle: oracle.keypair.publicKey,
              config: configPda,
              market: marketPubkey,
              magicProgram: MAGIC_PROGRAM_ID,
              magicContext: MAGIC_CONTEXT_ID,
            })
            .instruction();

    const resolveSignature = await sendAndConfirmTransaction(
      authenticatedEphemeralConnection,
      new Transaction().add(resolveIx),
      [oracle.keypair],
      {
        skipPreflight: true,
        commitment: 'confirmed',
      }
    );

    return { resolveSignature, commitSignature: null };
  }

  /**
   * Phase 1: Scan and resolve expired price markets.
   * This is fast — only sends resolve transactions to the ER.
   * Settlement is handled separately by autoSettleResolvedPositions().
   */
  async autoResolveExpiredPriceMarkets(options?: { limit?: number }) {
    const limit = options?.limit ?? 10;
    const config = await this.getProtocolConfig();
    const { data: markets } = await this.getAllMarkets({
      attachPriceData: false,
      fetchPrivateState: false,
    });

    const candidates = markets
      .filter(
        (market) =>
          market.delegated &&
          !market.account.resolved &&
          market.account.collateral_token === config.collateralMint &&
          market.account.oracle_kind === 'pythPrice' &&
          market.account.resolvable
      )
      .sort((a, b) => Number(a.account.end_time) - Number(b.account.end_time))
      .slice(0, limit);

    const results: Array<{
      market: string;
      question: string;
      success: boolean;
      resolveSignature?: string;
      error?: string;
    }> = [];

    for (const market of candidates) {
      try {
        const result = await this.resolveMarketAndCommit(market.publicKey, 'yes');
        results.push({
          market: market.publicKey,
          question: market.account.question,
          success: true,
          resolveSignature: result.resolveSignature,
        });
      } catch (error) {
        results.push({
          market: market.publicKey,
          question: market.account.question,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      scanned: markets.length,
      attempted: candidates.length,
      resolved: results.filter((result) => result.success).length,
      results,
    };
  }

  /**
   * Phase 2: Settle positions for already-resolved markets.
   * Runs independently from resolve — can be called on a separate tick.
   * Processes positions in parallel and does NOT wait for undelegation.
   */
  async autoSettleResolvedPositions(options?: { limit?: number }) {
    const limit = options?.limit ?? 10;
    const config = await this.getProtocolConfig();
    const { data: markets } = await this.getAllMarkets({
      attachPriceData: false,
      fetchPrivateState: false,
    });

    // Find resolved but still-delegated markets (positions need settlement)
    const candidates = markets
      .filter(
        (market) =>
          market.delegated &&
          market.account.resolved &&
          market.account.collateral_token === config.collateralMint
      )
      .slice(0, limit);

    const results: Array<{
      market: string;
      question: string;
      attempted: number;
      settled: number;
      settlementResults: Array<{
        position: string;
        trader: string;
        success: boolean;
        settleSignature?: string;
        commitSignature?: string;
        error?: string;
      }>;
    }> = [];

    for (const market of candidates) {
      try {
        const settlement = await this.settleResolvedMarketPositions(market.publicKey, limit);
        results.push({
          market: market.publicKey,
          question: market.account.question,
          attempted: settlement.attempted,
          settled: settlement.settled,
          settlementResults: settlement.results,
        });
      } catch (error) {
        results.push({
          market: market.publicKey,
          question: market.account.question,
          attempted: 0,
          settled: 0,
          settlementResults: [{
            position: 'unknown',
            trader: 'unknown',
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }],
        });
      }
    }

    return {
      scanned: markets.length,
      candidateMarkets: candidates.length,
      results,
    };
  }

  private async listMarketPositions(marketAddress: string): Promise<NormalizedPosition[]> {
    const marketPubkey = new PublicKey(marketAddress);
    const accountSources = await Promise.all([
      this.connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { dataSize: POSITION_ACCOUNT_SIZE },
          { memcmp: { offset: 8, bytes: marketPubkey.toBase58() } },
        ],
      }),
      this.connection.getProgramAccounts(DELEGATION_PROGRAM_ID, {
        filters: [
          { dataSize: POSITION_ACCOUNT_SIZE },
          { memcmp: { offset: 8, bytes: marketPubkey.toBase58() } },
        ],
      }),
      this.ephemeralConnection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { dataSize: POSITION_ACCOUNT_SIZE },
          { memcmp: { offset: 8, bytes: marketPubkey.toBase58() } },
        ],
      }),
    ]);

    const byAddress = new Map<string, NormalizedPosition>();
    for (const accounts of accountSources) {
      for (const { pubkey, account } of accounts) {
        try {
          const publicPosition = this.decodePositionAccount(account.data);
          const trader = new PublicKey(pk(publicPosition.trader));
          const privatePosition = await this.fetchPrivatePositionState(marketPubkey, trader);
          byAddress.set(
            pubkey.toBase58(),
            this.normalizePosition(pubkey, publicPosition, account.owner, privatePosition)
          );
        } catch {
          // Ignore unrelated delegated accounts with matching size.
        }
      }
    }

    return Array.from(byAddress.values());
  }

  private async settlePositionByKeeper(
    marketAddress: string,
    traderAddress: string,
    cachedKeeper?: { keypair: Keypair; ephemeralConnection: Connection; ephemeralProgram: any },
  ) {
    const marketPubkey = new PublicKey(marketAddress);
    const traderPubkey = new PublicKey(traderAddress);
    const [configPda] = this.getConfigPda();
    const [positionPda] = this.getPositionPda(marketPubkey, traderPubkey);
    const [privatePositionPda] = this.getPrivatePositionStatePda(marketPubkey, traderPubkey);

    let keeper: { keypair: Keypair };
    let authenticatedEphemeralConnection: Connection;
    let ephemeralProgram: any;

    if (cachedKeeper) {
      keeper = cachedKeeper;
      authenticatedEphemeralConnection = cachedKeeper.ephemeralConnection;
      ephemeralProgram = cachedKeeper.ephemeralProgram;
    } else {
      const config = await this.getProtocolConfig();
      const match = await this.requireMatchingKeypair(config.oracle, 'oracle');
      keeper = match;
      authenticatedEphemeralConnection =
        await this.createAuthenticatedEphemeralConnection(match.keypair);
      ephemeralProgram = this.createProgramClient(
        authenticatedEphemeralConnection,
        match.keypair,
        true
      );
    }

    const settleIx = await ephemeralProgram.methods
      .settlePrivatePositionByKeeperEr()
      .accountsPartial({
        keeper: keeper.keypair.publicKey,
        config: configPda,
        market: marketPubkey,
        position: positionPda,
        privatePosition: privatePositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const settleSignature = await sendAndConfirmTransaction(
      authenticatedEphemeralConnection,
      new Transaction().add(settleIx),
      [keeper.keypair],
      {
        skipPreflight: true,
        commitment: 'confirmed',
      }
    );

    // Fire-and-forget commit — don't block on waitForAccountOwner
    const { commitSignature } = await this.commitPosition(marketAddress, traderAddress);

    return { settleSignature, commitSignature };
  }

  private async settleResolvedMarketPositions(marketAddress: string, limit: number) {
    const positions = await this.listMarketPositions(marketAddress);
    const candidates = positions
      .filter((position) => !position.settled && !position.claimed)
      .slice(0, limit);
    const results: Array<{
      position: string;
      trader: string;
      success: boolean;
      settleSignature?: string;
      commitSignature?: string;
      error?: string;
    }> = [];

    // Cache keeper auth once for all positions in this market
    let cachedKeeper: { keypair: Keypair; ephemeralConnection: Connection; ephemeralProgram: any } | undefined;
    if (candidates.length > 0) {
      try {
        const config = await this.getProtocolConfig();
        const match = await this.requireMatchingKeypair(config.oracle, 'oracle');
        const ephemeralConnection = await this.createAuthenticatedEphemeralConnection(match.keypair);
        const ephemeralProgram = this.createProgramClient(ephemeralConnection, match.keypair, true);
        cachedKeeper = { keypair: match.keypair, ephemeralConnection, ephemeralProgram };
      } catch (error) {
        console.warn('[Keeper] Failed to cache keeper auth:', (error as Error).message);
      }
    }

    // Process positions in parallel (up to 5 at a time)
    const BATCH_SIZE = 5;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (position) => {
          const settled = await this.settlePositionByKeeper(marketAddress, position.trader, cachedKeeper);
          return {
            position: position.publicKey,
            trader: position.trader,
            success: true as const,
            settleSignature: settled.settleSignature,
            commitSignature: settled.commitSignature,
          };
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            position: batch[j].publicKey,
            trader: batch[j].trader,
            success: false,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    }

    return {
      attempted: candidates.length,
      settled: results.filter((result) => result.success).length,
      results,
    };
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
    const oracleKind = asNumber(account.oracle_kind);
    const priceDirection = asNumber(account.price_direction);
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
      tradingEnabled: delegated && !resolved && endTimeNum > nowSec,
      privacyNote: delegated
        ? 'This market is delegated into MagicBlock. Live positions and pricing stay inside PER until resolution.'
        : 'This shell is visible on Solana, but private live-state trading only works after MagicBlock delegation.',
      priceMarket: undefined,
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
        oracle_kind: oracleKind === 1 ? 'pythPrice' : 'manual',
        price_direction: priceDirection === 1 ? 'below' : 'above',
        target_price: asBigInt(account.target_price).toString(),
        oracle_feed: pk(account.oracle_feed),
        resolver_price: asBigInt(account.resolver_price).toString(),
      },
    };
  }

  private assertMarketTradeable(market: NormalizedMarket): void {
    if (market.account.resolved) {
      throw new Error('This market is already resolved. Trading is closed.');
    }

    if (market.account.resolvable) {
      throw new Error(
        'This market reached its resolution time. Trading is closed while the oracle/crank settles the outcome.'
      );
    }
  }

  private async attachPriceMarketData(
    market: NormalizedMarket
  ): Promise<NormalizedMarket> {
    if (market.account.oracle_kind !== 'pythPrice') {
      return market;
    }

    const asset = this.getPriceMarketAssetLabel(market.account.oracle_feed);
    const targetPriceUsd = this.rawPriceToUsd(market.account.target_price);
    const resolverPriceUsd = this.rawPriceToUsd(market.account.resolver_price);
    const currentRaw = market.account.oracle_feed
      ? await this.readOraclePriceRaw(market.account.oracle_feed)
      : null;
    const currentPriceUsd = currentRaw !== null ? this.rawPriceToUsd(currentRaw.toString()) : null;
    const direction = market.account.price_direction === 'below' ? 'below' : 'above';
    const targetLabel = targetPriceUsd !== null ? `$${targetPriceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'target';

    return {
      ...market,
      priceMarket: {
        asset,
        targetPriceUsd,
        currentPriceUsd,
        resolverPriceUsd,
        direction,
        oracleFeed: market.account.oracle_feed,
        rule: `${asset} ${direction} ${targetLabel} at resolution`,
      },
    };
  }

  private getPriceMarketAssetLabel(feed?: string): 'SOL/USD' | 'BTC/USD' | 'Unknown' {
    if (!feed) return 'Unknown';
    if (feed === MAGICBLOCK_SOL_USD_FEED.toBase58()) return 'SOL/USD';
    if (feed === MAGICBLOCK_BTC_USD_FEED.toBase58()) return 'BTC/USD';
    return 'Unknown';
  }

  private rawPriceToUsd(raw?: string): number | null {
    if (!raw) return null;
    try {
      return Number(raw) / 100_000_000;
    } catch {
      return null;
    }
  }

  private async readOraclePriceRaw(feedAddress: string): Promise<bigint | null> {
    try {
      const info = await this.magicblockReadConnection.getAccountInfo(new PublicKey(feedAddress), 'confirmed');
      if (!info || info.data.length < 81) return null;
      return info.data.readBigInt64LE(73);
    } catch {
      return null;
    }
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
      collateralWithdrawn: collateralWithdrawn.toString(),
      collateralAvailable: privateState
        ? asBigInt(privateState.collateral_available).toString()
        : l1Available.toString(),
      yesShares: privateState ? asBigInt(privateState.yes_shares).toString() : '0',
      noShares: privateState ? asBigInt(privateState.no_shares).toString() : '0',
      claimableAmount: asBigInt(account.claimable_amount).toString(),
      claimedAmount: asBigInt(account.claimed_amount).toString(),
      settled: boolFromU8(account.settled),
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

  private async createAuthenticatedEphemeralConnection(keypair: Keypair) {
    const auth = await getAuthToken(
      EPHEMERAL_RPC_URL,
      keypair.publicKey,
      async (message: Uint8Array) => nacl.sign.detached(message, keypair.secretKey)
    );

    return new Connection(`${EPHEMERAL_RPC_URL}?token=${auth.token}`, 'confirmed');
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

    const authenticatedEphemeralConnection =
      await this.createAuthenticatedEphemeralConnection(admin.keypair);
    const adminEphemeralProgram = this.createProgramClient(
      authenticatedEphemeralConnection,
      admin.keypair,
      true
    );
    
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

    // Fire-and-forget: don't block on waitForAccountOwner.
    // The position will eventually return to program ownership.
    // Blocking here caused 10-60s delays per position, killing the crank.

    return { commitSignature };
  }

  async commitMarketForClaim(marketAddress: string) {
    const marketPubkey = new PublicKey(marketAddress);
    const [configPda] = this.getConfigPda();

    const marketInfo = await this.connection.getAccountInfo(marketPubkey, 'confirmed');
    if (!marketInfo) {
      throw new Error('Market account not found.');
    }

    if (marketInfo.owner.equals(PROGRAM_ID)) {
      return { commitSignature: null, alreadyCommitted: true };
    }

    if (!marketInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
      throw new Error(
        `Market account is owned by ${marketInfo.owner.toBase58()}, expected ${PROGRAM_ID.toBase58()} or ${DELEGATION_PROGRAM_ID.toBase58()}.`
      );
    }

    const config = await this.getProtocolConfig();
    const admin = await this.requireMatchingKeypair(config.admin, 'admin');

    const authenticatedEphemeralConnection =
      await this.createAuthenticatedEphemeralConnection(admin.keypair);
    const adminEphemeralProgram = this.createProgramClient(
      authenticatedEphemeralConnection,
      admin.keypair,
      true
    );

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

    await this.waitForAccountOwner(marketPubkey, PROGRAM_ID, 60_000);

    return { commitSignature, alreadyCommitted: false };
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
    const position = await this.getTraderPositionInfo(params.market, params.walletAddress);

    if (!position) {
      throw new Error('No position found for this wallet on this market.');
    }

    if (!position.settled) {
      throw new Error('Your position is not settled yet. Settle it in MagicBlock before claiming.');
    }

    if (position.claimed) {
      throw new Error('This position has already been claimed.');
    }

    await this.commitMarketForClaim(params.market);

    const instructionProgram = this.createInstructionProgram(this.connection);
    const tx = new Transaction();

    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        traderPubkey,
        traderCollateralAta,
        traderPubkey,
        new PublicKey(config.collateralMint)
      )
    );

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

  private async waitForAccountOwner(
    account: PublicKey,
    expectedOwner: PublicKey,
    timeoutMs = 60_000
  ) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const info = await this.connection.getAccountInfo(account, 'confirmed');
      if (info?.owner.equals(expectedOwner)) {
        return;
      }
      await sleep(750);
    }

    const finalInfo = await this.connection.getAccountInfo(account, 'confirmed');
    throw new Error(
      `Timed out waiting for ${account.toBase58()} owner to become ${expectedOwner.toBase58()}. ` +
        `Current owner: ${finalInfo?.owner.toBase58() || 'missing'}`
    );
  }
}

export const coreService = new MagicBlockIndexer();
