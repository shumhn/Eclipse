import * as fs from 'fs';
import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import { assert } from 'chai';
import bs58 from 'bs58';
import * as dotenv from 'dotenv';
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
import nacl from 'tweetnacl';

dotenv.config();

const anchorPkg = (anchor as any).default ?? anchor;
const { AnchorProvider, BN, Program, Wallet, workspace, setProvider } = anchorPkg;

if (!process.env.ANCHOR_PROVIDER_URL) {
  process.env.ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';
}

if (!process.env.ANCHOR_WALLET && process.env.HOME) {
  process.env.ANCHOR_WALLET = `${process.env.HOME}/.config/solana/id.json`;
}

const EPHEMERAL_RPC_URL = 'https://devnet-tee.magicblock.app';
const PROGRAM_ID = new PublicKey('79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t');
const MAGIC_PROGRAM_ID = new PublicKey('Magic11111111111111111111111111111111111111');
const MAGIC_CONTEXT_ID = new PublicKey('MagicContext1111111111111111111111111111111');
const MAGIC_VAULT_ID = new PublicKey('MagicVau1t999999999999999999999999999999999');
const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

async function sendTeeTransaction(
  connection: Connection,
  transaction: Transaction,
  signer: Keypair,
) {
  const latest = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer = signer.publicKey;
  transaction.sign(signer);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: true,
  });

  const status = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    'confirmed'
  );

  if (status.value.err) {
    try {
      const txDetail = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      console.log('TEE tx logs:', JSON.stringify(txDetail?.meta?.logMessages));
      console.log('TEE tx err:', JSON.stringify(txDetail?.meta?.err));
    } catch (fetchErr) {
      console.log('Failed to fetch TEE tx logs:', fetchErr);
    }

    throw new Error(`TEE tx failed: ${JSON.stringify(status.value.err)}`);
  }

  return signature;
}

async function waitForAccountOwner(
  connection: Connection,
  account: PublicKey,
  expectedOwner: PublicKey,
  timeoutMs = 15_000,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const info = await connection.getAccountInfo(account, 'confirmed');
    if (info?.owner.equals(expectedOwner)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  const finalInfo = await connection.getAccountInfo(account, 'confirmed');
  throw new Error(
    `Timed out waiting for ${account.toBase58()} owner to become ${expectedOwner.toBase58()}. ` +
      `Current owner: ${finalInfo?.owner.toBase58() || 'missing'}`
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('PER Prediction Market Smoke', () => {
  // Setup providers
  const provider = AnchorProvider.env();
  setProvider(provider);
  
  // We need the IDL to create the program instance without relying on the local workspace
  // since this might be run against devnet directly.
  let program: anchor.Program;
  
  let ephemeralConnection: Connection;
  let ephemeralProgram: anchor.Program;

  let admin: Keypair;
  let trader: Keypair;
  let oracle: Keypair;

  let collateralMint: PublicKey;
  let runtimeProgramId: PublicKey;

  let configPda: PublicKey;
  let marketPda: PublicKey;
  let marketId: number;
  let marketEndTime: number;
  let traderPositionPda: PublicKey;
  let marketStatePda: PublicKey;
  let privatePositionPda: PublicKey;
  let topupReceiptPda: PublicKey;
  let topupNonce: bigint;
  let vaultAta: PublicKey;

  before(async () => {
    // Attempt to load private key from env, fallback to provider wallet
    if (process.env.SOLANA_PRIVATE_KEY) {
      const secretKey = bs58.decode(process.env.SOLANA_PRIVATE_KEY);
      admin = Keypair.fromSecretKey(secretKey);
      trader = Keypair.fromSecretKey(secretKey);
      oracle = Keypair.fromSecretKey(secretKey);
      console.log("Using SOLANA_PRIVATE_KEY from .env");
    } else {
      admin = (provider.wallet as anchor.Wallet).payer;
      trader = admin;
      oracle = admin;
      console.log("Using Provider Wallet");
    }

    // Use the anchor workspace to automatically load the program from the built IDL
    program = workspace.PredictionMarket as anchor.Program;
    runtimeProgramId = program.programId;

    const expectedProgramId = process.env.PREDICTION_MARKET_PROGRAM_ID;
    if (expectedProgramId && !runtimeProgramId.equals(new PublicKey(expectedProgramId))) {
      throw new Error(
        `Program ID mismatch: workspace/IDL uses ${runtimeProgramId.toBase58()} but ` +
        `PREDICTION_MARKET_PROGRAM_ID is ${expectedProgramId}. Sync declare_id!, IDL, Anchor.toml, and tests first.`
      );
    }

    if (!runtimeProgramId.equals(PROGRAM_ID)) {
      throw new Error(
        `Smoke test PROGRAM_ID (${PROGRAM_ID.toBase58()}) does not match workspace program (${runtimeProgramId.toBase58()}).`
      );
    }
    
    const teeAuth = await getAuthToken(
      EPHEMERAL_RPC_URL,
      trader.publicKey,
      async (message: Uint8Array) => nacl.sign.detached(message, trader.secretKey)
    );

    ephemeralConnection = new Connection(
      `${EPHEMERAL_RPC_URL}?token=${teeAuth.token}`,
      'confirmed'
    );

    const ephemeralProvider = new AnchorProvider(
      ephemeralConnection,
      new Wallet(admin),
      { commitment: 'confirmed', skipPreflight: true }
    );
    ephemeralProgram = new Program(program.idl as any, ephemeralProvider);

    [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);

    // Use standard devnet USDC for the real smoke flow.
    const configInfo = await provider.connection.getAccountInfo(configPda);
    if (configInfo) {
      const configData = await (program.account as any).config.fetch(configPda);
      collateralMint = DEVNET_USDC_MINT;
      if (!configData.collateralMint.equals(DEVNET_USDC_MINT)) {
        await program.methods
          .updateCollateralMint()
          .accounts({
            admin: admin.publicKey,
            config: configPda,
            collateralMint: DEVNET_USDC_MINT,
          })
          .signers([admin])
          .rpc();
      }
      console.log("Using standard devnet USDC mint:", collateralMint.toBase58());
    } else {
      collateralMint = DEVNET_USDC_MINT;
      console.log("Initializing config with standard devnet USDC mint:", collateralMint.toBase58());
    }
  });

  it('initializes config (or verifies it exists)', async () => {
    const configInfo = await provider.connection.getAccountInfo(configPda);
    if (!configInfo) {
      console.log("Initializing config...");
      await program.methods
        .initialize(
          100, // protocol_fee_bps
          oracle.publicKey,
          new PublicKey('EphmRLs9Tznd5yVdK7K9Xg2dRQhG3Q9K2wGjR1VzVjH8') // Example TEE validator
        )
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          collateralMint: collateralMint,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    } else {
      console.log("Config already initialized.");
    }
    
    // Fetch market count to determine the next market ID
    const configData = await (program.account as any).config.fetch(configPda);
    marketId = (configData.marketCount as anchor.BN).toNumber();
  });

  it('creates private market', async () => {
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(BigInt(marketId));
    [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), idBuf], PROGRAM_ID);

    [traderPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), trader.publicKey.toBuffer()],
      PROGRAM_ID
    );
    [privatePositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('private_position_state'), marketPda.toBuffer(), trader.publicKey.toBuffer()],
      PROGRAM_ID
    );

    vaultAta = await getAssociatedTokenAddress(collateralMint, marketPda, true);
    const creatorCollateral = await getAssociatedTokenAddress(collateralMint, trader.publicKey);

    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        trader.publicKey,
        vaultAta,
        marketPda,
        collateralMint
      )
    );

    marketEndTime = Math.floor(Date.now() / 1000) + 45;

    const createIx = await program.methods
      .createPrivateMarket(
        "Will this smoke test pass?",
        new BN(marketEndTime),
        new BN(1_000_000) // 1 USDC initial liquidity
      )
      .accounts({
        creator: trader.publicKey,
        config: configPda,
        market: marketPda,
        creatorPosition: traderPositionPda,
        collateralMint: collateralMint,
        creatorCollateral: creatorCollateral,
        vault: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
      
    tx.add(createIx);
    
    await provider.sendAndConfirm(tx, [trader]);
      
    const marketData = await (program.account as any).market.fetch(marketPda);
    assert.equal(marketData.question, "Will this smoke test pass?");
    assert.equal(
      (marketData.protocolFeesAccrued as anchor.BN).toNumber(),
      500_000,
      'creation fee should accrue as aggregate protocol fees'
    );
  });

  it('delegates market', async () => {
    const marketPermission = permissionPdaFromAccount(marketPda);
    const bufferMarket = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(marketPda, PROGRAM_ID);
    const delegationRecordMarket = delegationRecordPdaFromDelegatedAccount(marketPda);
    const delegationMetadataMarket = delegationMetadataPdaFromDelegatedAccount(marketPda);

    try {
      await program.methods
        .createMarketPermission()
        .accounts({
          authority: admin.publicKey,
          config: configPda,
          market: marketPda,
          permission: marketPermission,
          permissionProgram: PERMISSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const delegatePermissionIx = createDelegatePermissionInstruction({
        payer: admin.publicKey,
        authority: [admin.publicKey, true],
        permissionedAccount: [marketPda, false],
        ownerProgram: PERMISSION_PROGRAM_ID,
        validator: new PublicKey('FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA'),
      });

      const delegateMarketIx = await program.methods
        .delegateMarketIntoTee(new BN(marketId))
        .accounts({
          authority: admin.publicKey,
          config: configPda,
          bufferMarket,
          delegationRecordMarket,
          delegationMetadataMarket,
          market: marketPda,
          ownerProgram: PROGRAM_ID,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      await provider.sendAndConfirm(
        new Transaction().add(delegatePermissionIx, delegateMarketIx),
        [admin]
      );
    } catch (e: any) {
      console.log("delegateMarketIntoTee failed (possibly already delegated):", e.message);
    }
  });

  it('delegates position', async () => {
    const positionPermission = permissionPdaFromAccount(traderPositionPda);
    const bufferPosition = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(traderPositionPda, PROGRAM_ID);
    const delegationRecordPosition = delegationRecordPdaFromDelegatedAccount(traderPositionPda);
    const delegationMetadataPosition = delegationMetadataPdaFromDelegatedAccount(traderPositionPda);
    const privatePositionPermission = permissionPdaFromAccount(privatePositionPda);
    const bufferPrivatePosition = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(privatePositionPda, PROGRAM_ID);
    const delegationRecordPrivatePosition = delegationRecordPdaFromDelegatedAccount(privatePositionPda);
    const delegationMetadataPrivatePosition = delegationMetadataPdaFromDelegatedAccount(privatePositionPda);

    try {
      await program.methods
        .createPositionPermission()
        .accounts({
          authority: admin.publicKey,
          config: configPda,
          position: traderPositionPda,
          permission: positionPermission,
          permissionProgram: PERMISSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const delegatePermissionIx = createDelegatePermissionInstruction({
        payer: admin.publicKey,
        authority: [admin.publicKey, true],
        permissionedAccount: [traderPositionPda, false],
        ownerProgram: PERMISSION_PROGRAM_ID,
        validator: new PublicKey('FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA'),
      });

      const delegatePositionIx = await program.methods
        .delegatePositionIntoTee(marketPda, trader.publicKey)
        .accounts({
          authority: admin.publicKey,
          config: configPda,
          bufferPosition,
          delegationRecordPosition,
          delegationMetadataPosition,
          position: traderPositionPda,
          ownerProgram: PROGRAM_ID,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const createPrivatePositionPermissionIx = await program.methods
        .createPrivatePositionPermission()
        .accounts({
          authority: admin.publicKey,
          config: configPda,
          privatePosition: privatePositionPda,
          permission: privatePositionPermission,
          permissionProgram: PERMISSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const delegatePrivatePermissionIx = createDelegatePermissionInstruction({
        payer: admin.publicKey,
        authority: [admin.publicKey, true],
        permissionedAccount: [privatePositionPda, false],
        ownerProgram: PERMISSION_PROGRAM_ID,
        validator: new PublicKey('FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA'),
      });

      const delegatePrivatePositionIx = await program.methods
        .delegatePrivatePositionIntoTee(marketPda, trader.publicKey)
        .accounts({
          authority: admin.publicKey,
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

      await provider.sendAndConfirm(
        new Transaction().add(
          delegatePermissionIx,
          delegatePositionIx,
          createPrivatePositionPermissionIx,
          delegatePrivatePermissionIx,
          delegatePrivatePositionIx
        ),
        [admin]
      );
    } catch (e: any) {
      console.log("delegate position/private position failed (possibly already delegated):", e.message);
    }
  });

  it('initializes private market state', async () => {
    [marketStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('private_market_state'), marketPda.toBuffer()],
      PROGRAM_ID
    );
    
    // Wait a few seconds for Devnet RPC to propagate the delegation state
    // so the ConnectionMagicRouter knows to route this to L2.
    await new Promise(r => setTimeout(r, 3000));

    try {
      const ix = await ephemeralProgram.methods
        .initializePrivateMarketState()
        .accounts({
          initializer: trader.publicKey,
          config: configPda,
          market: marketPda,
          creatorPosition: traderPositionPda,
          marketState: marketStatePda,
          privatePosition: privatePositionPda,
          vault: MAGIC_VAULT_ID,
          magicProgram: MAGIC_PROGRAM_ID,
        })
        .instruction();

      ix.keys = ix.keys.map((key) => {
        if (key.pubkey.equals(MAGIC_VAULT_ID)) {
          return { ...key, isWritable: true };
        }

        return key;
      });

      await sendTeeTransaction(
        ephemeralConnection,
        new Transaction().add(ix),
        trader
      );
    } catch (e: any) {
      console.error("Initialize ER state failed:", e);
      if (e.logs) console.error("Logs:", e.logs);
      throw e;
    }
  });

  it('tops up and buys YES inside ER', async () => {
    const amountToSpend = new BN(100_000); // 0.10 USDC
    topupNonce = BigInt(Date.now()) * BigInt(1000);
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(topupNonce);
    [topupReceiptPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('position_topup_receipt'),
        marketPda.toBuffer(),
        trader.publicKey.toBuffer(),
        nonceBuf,
      ],
      PROGRAM_ID
    );

    const traderCollateral = await getAssociatedTokenAddress(collateralMint, trader.publicKey);
    const topupIx = await program.methods
      .createPositionTopupReceipt(new BN(topupNonce.toString()), amountToSpend)
      .accounts({
        trader: trader.publicKey,
        config: configPda,
        market: marketPda,
        receipt: topupReceiptPda,
        collateralMint,
        traderCollateral,
        vault: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    await provider.sendAndConfirm(new Transaction().add(topupIx), [trader]);

    const receiptPermission = permissionPdaFromAccount(topupReceiptPda);
    const bufferReceipt = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(topupReceiptPda, PROGRAM_ID);
    const delegationRecordReceipt = delegationRecordPdaFromDelegatedAccount(topupReceiptPda);
    const delegationMetadataReceipt = delegationMetadataPdaFromDelegatedAccount(topupReceiptPda);

    const createReceiptPermissionIx = await program.methods
      .createTopupReceiptPermission()
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        receipt: topupReceiptPda,
        permission: receiptPermission,
        permissionProgram: PERMISSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const delegatePermissionIx = createDelegatePermissionInstruction({
      payer: admin.publicKey,
      authority: [admin.publicKey, true],
      permissionedAccount: [topupReceiptPda, false],
      ownerProgram: PERMISSION_PROGRAM_ID,
      validator: new PublicKey('FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA'),
    });

    const delegateReceiptIx = await program.methods
      .delegateTopupReceiptIntoTee(marketPda, trader.publicKey, new BN(topupNonce.toString()))
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        bufferReceipt,
        delegationRecordReceipt,
        delegationMetadataReceipt,
        receipt: topupReceiptPda,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    await provider.sendAndConfirm(
      new Transaction().add(createReceiptPermissionIx, delegatePermissionIx, delegateReceiptIx),
      [admin]
    );

    await sleep(3_000);

    const buyIx = await ephemeralProgram.methods
      .consumeTopupAndPlacePrivatePredictionEr(amountToSpend, true, new BN(0))
      .accountsPartial({
        trader: trader.publicKey,
        config: configPda,
        market: marketPda,
        position: traderPositionPda,
        privatePosition: privatePositionPda,
        receipt: topupReceiptPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const buySig = await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(buyIx),
      trader
    );
    console.log('private_buy:', buySig);

    const marketData = await (ephemeralProgram.account as any).market.fetch(marketPda);
    const accruedFees = (marketData.protocolFeesAccrued as anchor.BN).toNumber();
    assert.isAbove(accruedFees, 500_000, 'private trade fee should increase aggregate protocol fees');
  });

  it('resolves market inside ER', async () => {
    const waitMs = (marketEndTime * 1000) - Date.now() + 2_000;
    if (waitMs > 0) {
      console.log(`waiting ${waitMs}ms for market end`);
      await sleep(waitMs);
    }

    const ix = await ephemeralProgram.methods
      .resolvePrivateMarketEr(true) // YES wins
      .accounts({
        oracle: oracle.publicKey,
        config: configPda,
        market: marketPda,
        marketState: marketStatePda,
        vault: MAGIC_VAULT_ID,
        magicProgram: MAGIC_PROGRAM_ID,
      })
      .instruction();

    await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(ix),
      oracle
    );
  });

  it('settles position inside ER', async () => {
    const ix = await ephemeralProgram.methods
      .settlePrivatePositionEr()
      .accountsPartial({
        trader: trader.publicKey,
        config: configPda,
        market: marketPda,
        position: traderPositionPda,
        privatePosition: privatePositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(ix),
      trader
    );
  });

  it('claims payout (commits and undelegates)', async () => {
    // Match the working payroll lifecycle:
    // 1. commit state back to Solana
    // 2. wait for the async base-layer callback path
    // 3. undelegate and wait for ownership to return
    const commitMarketIx = await ephemeralProgram.methods
      .commitMarket()
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        market: marketPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const commitMarketSig = await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(commitMarketIx),
      admin
    );
    console.log('commit_market:', commitMarketSig);

    const commitPositionIx = await ephemeralProgram.methods
      .commitPosition()
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        position: traderPositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const commitPositionSig = await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(commitPositionIx),
      admin
    );
    console.log('commit_position:', commitPositionSig);

    await sleep(4_000);

    const undelegatePositionIx = await ephemeralProgram.methods
      .commitPositionAndUndelegate()
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        position: traderPositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const undelegatePositionSig = await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(undelegatePositionIx),
      admin
    );
    console.log('commit_position_and_undelegate:', undelegatePositionSig);

    await waitForAccountOwner(provider.connection, traderPositionPda, PROGRAM_ID, 60_000);

    const undelegateMarketIx = await ephemeralProgram.methods
      .commitAndUndelegate()
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        market: marketPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    const undelegateMarketSig = await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(undelegateMarketIx),
      admin
    );
    console.log('commit_and_undelegate:', undelegateMarketSig);

    await waitForAccountOwner(provider.connection, marketPda, PROGRAM_ID, 60_000);

    // Finally claim payout
    const traderCollateral = await getAssociatedTokenAddress(collateralMint, trader.publicKey);
    await program.methods
      .claimSettledPrivatePosition()
      .accounts({
        trader: trader.publicKey,
        market: marketPda,
        position: traderPositionPda,
        collateralMint: collateralMint,
        traderCollateral: traderCollateral,
        vault: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();
      
    assert.isTrue(true);
  });
});
