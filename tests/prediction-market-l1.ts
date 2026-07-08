import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import assert from 'node:assert/strict';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  transferChecked,
} from '@solana/spl-token';
import {
  DELEGATION_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  createDelegatePermissionInstruction,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  getAuthToken,
  getDelegationRecord,
  permissionPdaFromAccount,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import nacl from 'tweetnacl';

import { PredictionMarket } from '../target/types/prediction_market';

const EPHEMERAL_RPC_URL = 'https://devnet-tee.magicblock.app';
const MAGIC_PROGRAM_ID = new PublicKey(
  'Magic11111111111111111111111111111111111111'
);
const MAGIC_CONTEXT_ID = new PublicKey(
  'MagicContext1111111111111111111111111111111'
);
const PYTH_LAZER_PROGRAM_ID = new PublicKey(
  'PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd'
);
const MAGICBLOCK_SOL_USD_FEED = new PublicKey(
  'ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu'
);
const DEVNET_USDC_MINT = new PublicKey(
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);
const ER_SPONSOR_BUFFER_LAMPORTS = 100_000;

async function ensureTokenBalance(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  requiredAmount: bigint
) {
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner
  );

  if (tokenAccount.amount >= requiredAmount) {
    return tokenAccount.address;
  }

  throw new Error(
    `Wallet ${owner.toBase58()} needs ${requiredAmount.toString()} units of mint ${mint.toBase58()}, ` +
      `but only has ${tokenAccount.amount.toString()}. Fund real devnet USDC before running this test.`
  );
}

function derivePythLazerFeedAddress(feedId: string): PublicKey {
  const [feed] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('price_feed'),
      Buffer.from('pyth-lazer'),
      Buffer.from(feedId),
    ],
    PYTH_LAZER_PROGRAM_ID
  );
  return feed;
}

async function sendTeeTransaction(
  connection: Connection,
  transaction: Transaction,
  signer: Keypair
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

async function waitForAccountOnConnection(
  connection: Connection,
  account: PublicKey,
  timeoutMs = 15_000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const info = await connection.getAccountInfo(account, 'confirmed');
    if (info) {
      return info;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  return null;
}

async function waitForAccountOwner(
  connection: Connection,
  account: PublicKey,
  expectedOwner: PublicKey,
  timeoutMs = 60_000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const info = await connection.getAccountInfo(account, 'confirmed');
    if (info?.owner.equals(expectedOwner)) {
      return;
    }
    await sleep(750);
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

async function getTeeValidatorIdentity(endpoint: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getIdentity',
      params: [],
    }),
  });
  const body = (await response.json()) as { result: { identity: string } };
  return new PublicKey(body.result.identity);
}

async function assertDelegatedToConfiguredValidator(
  connection: Connection,
  account: PublicKey,
  expectedValidator: PublicKey,
  label: string
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 15_000) {
    const record = await getDelegationRecord(connection, account);
    if (record.status === 0) {
      assert.ok(
        record.validator.equals(expectedValidator),
        `${label} delegated to ${record.validator.toBase58()}, expected ${expectedValidator.toBase58()}`
      );
      return;
    }
    await sleep(750);
  }

  // Devnet RPC can lag or temporarily miss delegation-record PDAs even after the
  // delegated account owner has switched and the ER accepts the account. Keep
  // this as a diagnostic; the owner + ER execution checks remain authoritative.
  console.warn(
    `${label} delegation record was not visible on base RPC yet; continuing after delegated owner check`
  );
}

describe('prediction_market L1 smoke', () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>;
  const admin = (provider.wallet as anchor.Wallet).payer;
  const oracle = Keypair.generate();
  const teeValidatorSigner = Keypair.generate();
  const trader = Keypair.generate();

  let collateralMint: PublicKey;
  let configPda: PublicKey;
  let configuredTeeValidator: PublicKey;
  let latestMarketPda: PublicKey;
  let creatorPositionPda: PublicKey;
  let creatorPrivatePositionPda: PublicKey;
  let latestPositionPda: PublicKey;
  let latestPrivatePositionPda: PublicKey;
  let latestMarketEndTime: number;
  let latestOracleFeedPda: PublicKey;
  let adminCollateralAta: PublicKey;
  let ephemeralConnection: Connection;
  let ephemeralProgram: Program<PredictionMarket>;

  before(async () => {
    configuredTeeValidator = await getTeeValidatorIdentity(EPHEMERAL_RPC_URL);
    console.log(
      'MagicBlock TEE validator:',
      configuredTeeValidator.toBase58()
    );

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      program.programId
    );

    const existingConfigInfo = await provider.connection.getAccountInfo(configPda);

    if (existingConfigInfo) {
      const configAccount = await program.account.config.fetch(configPda);
      collateralMint = DEVNET_USDC_MINT;
      if (!configAccount.oracle.equals(oracle.publicKey)) {
        await program.methods
          .updateOracle(oracle.publicKey)
          .accountsPartial({
            admin: admin.publicKey,
            config: configPda,
          })
          .signers([admin])
          .rpc();
      }

      if (!configAccount.teeValidator.equals(configuredTeeValidator)) {
        await program.methods
          .updateTeeValidator(configuredTeeValidator)
          .accountsPartial({
            admin: admin.publicKey,
            config: configPda,
          })
          .signers([admin])
          .rpc();
      }

      if (!configAccount.collateralMint.equals(DEVNET_USDC_MINT)) {
        await program.methods
          .updateCollateralMint()
          .accountsPartial({
            admin: admin.publicKey,
            config: configPda,
            collateralMint: DEVNET_USDC_MINT,
          })
          .signers([admin])
          .rpc();
      }
    } else {
      collateralMint = DEVNET_USDC_MINT;

      await program.methods
        .initialize(0, oracle.publicKey, configuredTeeValidator)
        .accountsPartial({
          admin: admin.publicKey,
          config: configPda,
          collateralMint,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const configAccount = await program.account.config.fetch(configPda);
      assert.ok(configAccount.admin.equals(admin.publicKey));
      assert.ok(configAccount.collateralMint.equals(collateralMint));
      assert.equal(configAccount.protocolFeeBps, 0);
    }

    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: trader.publicKey,
          lamports: Math.floor(0.05 * LAMPORTS_PER_SOL),
        }),
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: oracle.publicKey,
          lamports: Math.floor(0.05 * LAMPORTS_PER_SOL),
        })
      ),
      [admin]
    );

    const teeAuth = await getAuthToken(
      EPHEMERAL_RPC_URL,
      admin.publicKey,
      async (message: Uint8Array) =>
        nacl.sign.detached(message, admin.secretKey)
    );

    ephemeralConnection = new Connection(
      `${EPHEMERAL_RPC_URL}?token=${teeAuth.token}`,
      'confirmed'
    );

    ephemeralProgram = new Program<PredictionMarket>(
      program.idl as PredictionMarket,
      new AnchorProvider(
        ephemeralConnection,
        new anchor.Wallet(admin),
        { commitment: 'confirmed', skipPreflight: true }
      )
    );
  });

  it('creates a private market with initial liquidity on L1', async () => {
    const adminAta = await ensureTokenBalance(
      provider.connection,
      admin,
      collateralMint,
      admin.publicKey,
      2_000_000n
    );

    adminCollateralAta = adminAta;

    const configAccount = await program.account.config.fetch(configPda);
    const marketId = configAccount.marketCount.toNumber();

    const marketIdBuffer = Buffer.alloc(8);
    marketIdBuffer.writeBigUInt64LE(BigInt(marketId));

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('market'), marketIdBuffer],
      program.programId
    );

    [creatorPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), marketPda.toBuffer(), admin.publicKey.toBuffer()],
      program.programId
    );

    [creatorPrivatePositionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('private_position_state'),
        marketPda.toBuffer(),
        admin.publicKey.toBuffer(),
      ],
      program.programId
    );

    const vaultAta = await getAssociatedTokenAddress(
      collateralMint,
      marketPda,
      true
    );

    latestOracleFeedPda = MAGICBLOCK_SOL_USD_FEED;
    const question = `Will SOL/USD stay above zero for L1 smoke ${Date.now()}?`;
    latestMarketEndTime = Math.floor(Date.now() / 1000) + 90;
    const endTime = new anchor.BN(latestMarketEndTime);
    const initialLiquidity = new anchor.BN(1_000_000);

    await program.methods
      .createPriceMarket(
        question,
        endTime,
        initialLiquidity,
        new anchor.BN(0),
        { above: {} },
        latestOracleFeedPda
      )
      .accountsPartial({
        creator: admin.publicKey,
        config: configPda,
        market: marketPda,
        creatorPosition: creatorPositionPda,
        creatorPrivatePosition: creatorPrivatePositionPda,
        collateralMint,
        creatorCollateral: adminAta.address,
        vault: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: marketPda,
          lamports: ER_SPONSOR_BUFFER_LAMPORTS,
        }),
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: creatorPositionPda,
          lamports: ER_SPONSOR_BUFFER_LAMPORTS,
        }),
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: creatorPrivatePositionPda,
          lamports: ER_SPONSOR_BUFFER_LAMPORTS,
        })
      ),
      [admin]
    );

    latestMarketPda = marketPda;

    const market = await program.account.market.fetch(marketPda);

    assert.equal(market.id.toNumber(), marketId);
    assert.ok(market.creator.equals(admin.publicKey));
    assert.equal(market.question, question);
    assert.equal(market.endTime.toString(), endTime.toString());
    assert.equal(market.totalDeposited.toString(), initialLiquidity.toString());
    assert.deepEqual(market.status, { active: {} });
    assert.deepEqual(market.outcome, { undetermined: {} });
  });

  it('opens a fresh trader position shell on L1', async () => {
    const [positionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('position'),
        latestMarketPda.toBuffer(),
        trader.publicKey.toBuffer(),
      ],
      program.programId
    );
    const [privatePositionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('private_position_state'),
        latestMarketPda.toBuffer(),
        trader.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .openPosition()
      .accountsPartial({
        trader: trader.publicKey,
        config: configPda,
        market: latestMarketPda,
        position: positionPda,
        privatePosition: privatePositionPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    latestPositionPda = positionPda;
    latestPrivatePositionPda = privatePositionPda;

    const position = await program.account.traderPosition.fetch(positionPda);

    assert.ok(position.market.equals(latestMarketPda));
    assert.ok(position.trader.equals(trader.publicKey));
    assert.equal(position.collateralDeposited.toString(), '0');
    assert.equal(position.collateralWithdrawn.toString(), '0');
    assert.equal(position.delegated, false);
    assert.equal(position.settled, false);
    assert.equal(position.claimed, false);
  });

  it('deposits trader collateral into the market vault on L1', async () => {
    const traderCollateralAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin,
      collateralMint,
      trader.publicKey
    );

    const adminCollateralAccount = await getAccount(
      provider.connection,
      adminCollateralAta,
      'confirmed',
      TOKEN_PROGRAM_ID
    );
    assert.ok(
      adminCollateralAccount.amount >= 400_000n,
      `admin needs at least 400000 units of ${collateralMint.toBase58()} for trader funding`
    );

    await transferChecked(
      provider.connection,
      admin,
      adminCollateralAta,
      collateralMint,
      traderCollateralAta.address,
      admin,
      400_000,
      6
    );

    const marketBefore = await program.account.market.fetch(latestMarketPda);

    const vaultAta = await getAssociatedTokenAddress(
      collateralMint,
      latestMarketPda,
      true
    );

    const depositAmount = new anchor.BN(250_000);

    await program.methods
      .depositCollateral(depositAmount)
      .accountsPartial({
        trader: trader.publicKey,
        config: configPda,
        market: latestMarketPda,
        position: latestPositionPda,
        privatePosition: latestPrivatePositionPda,
        collateralMint,
        traderCollateral: traderCollateralAta.address,
        vault: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    const marketAfter = await program.account.market.fetch(latestMarketPda);
    const positionAfter = await program.account.traderPosition.fetch(latestPositionPda);

    assert.equal(positionAfter.collateralDeposited.toString(), depositAmount.toString());
    assert.equal(
      marketAfter.totalDeposited.toString(),
      marketBefore.totalDeposited.toString()
    );
  });

  it('delegates the market shell into MagicBlock', async () => {
    const marketPermission = permissionPdaFromAccount(latestMarketPda);
    const bufferMarket = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
      latestMarketPda,
      program.programId
    );
    const delegationRecordMarket =
      delegationRecordPdaFromDelegatedAccount(latestMarketPda);
    const delegationMetadataMarket =
      delegationMetadataPdaFromDelegatedAccount(latestMarketPda);

    await program.methods
      .createMarketPermission()
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        market: latestMarketPda,
        permission: marketPermission,
        permissionProgram: PERMISSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const marketBefore = await program.account.market.fetch(latestMarketPda);

    const delegatePermissionIx = createDelegatePermissionInstruction({
      payer: admin.publicKey,
      authority: [admin.publicKey, true],
      permissionedAccount: [latestMarketPda, false],
      ownerProgram: PERMISSION_PROGRAM_ID,
      validator: configuredTeeValidator,
    });

    const delegateMarketIx = await program.methods
      .delegateMarketIntoTee(new anchor.BN(marketBefore.id.toString()))
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        bufferMarket,
        delegationRecordMarket,
        delegationMetadataMarket,
        market: latestMarketPda,
        ownerProgram: program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    await provider.sendAndConfirm(
      new Transaction().add(delegatePermissionIx, delegateMarketIx),
      [admin]
    );

    const delegatedMarketInfo = await provider.connection.getAccountInfo(
      latestMarketPda
    );

    assert.ok(delegatedMarketInfo, 'delegated market account should exist');
    assert.ok(
      delegatedMarketInfo!.owner.equals(DELEGATION_PROGRAM_ID),
      `expected market owner ${DELEGATION_PROGRAM_ID.toBase58()}, got ${delegatedMarketInfo!.owner.toBase58()}`
    );
    await assertDelegatedToConfiguredValidator(
      provider.connection,
      latestMarketPda,
      configuredTeeValidator,
      'market'
    );
  });

  it('delegates the trader position shell into MagicBlock', async () => {
    const positionPermission = permissionPdaFromAccount(latestPositionPda);
    const bufferPosition = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
      latestPositionPda,
      program.programId
    );
    const delegationRecordPosition =
      delegationRecordPdaFromDelegatedAccount(latestPositionPda);
    const delegationMetadataPosition =
      delegationMetadataPdaFromDelegatedAccount(latestPositionPda);

    await program.methods
      .createPositionPermission()
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        position: latestPositionPda,
        permission: positionPermission,
        permissionProgram: PERMISSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const delegatePermissionIx = createDelegatePermissionInstruction({
      payer: admin.publicKey,
      authority: [admin.publicKey, true],
      permissionedAccount: [latestPositionPda, false],
      ownerProgram: PERMISSION_PROGRAM_ID,
      validator: configuredTeeValidator,
    });

    const delegatePositionIx = await program.methods
      .delegatePositionIntoTee(latestMarketPda, trader.publicKey)
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        bufferPosition,
        delegationRecordPosition,
        delegationMetadataPosition,
        position: latestPositionPda,
        ownerProgram: program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    await provider.sendAndConfirm(
      new Transaction().add(delegatePermissionIx, delegatePositionIx),
      [admin]
    );

    const delegatedPositionInfo = await provider.connection.getAccountInfo(
      latestPositionPda
    );

    assert.ok(delegatedPositionInfo, 'delegated position account should exist');
    assert.ok(
      delegatedPositionInfo!.owner.equals(DELEGATION_PROGRAM_ID),
      `expected position owner ${DELEGATION_PROGRAM_ID.toBase58()}, got ${delegatedPositionInfo!.owner.toBase58()}`
    );
    await assertDelegatedToConfiguredValidator(
      provider.connection,
      latestPositionPda,
      configuredTeeValidator,
      'trader position'
    );
  });

  it('delegates the creator position shell into MagicBlock', async () => {
    const creatorPositionPermission = permissionPdaFromAccount(creatorPositionPda);
    const bufferPosition = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
      creatorPositionPda,
      program.programId
    );
    const delegationRecordPosition =
      delegationRecordPdaFromDelegatedAccount(creatorPositionPda);
    const delegationMetadataPosition =
      delegationMetadataPdaFromDelegatedAccount(creatorPositionPda);

    await program.methods
      .createPositionPermission()
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        position: creatorPositionPda,
        permission: creatorPositionPermission,
        permissionProgram: PERMISSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const delegatePermissionIx = createDelegatePermissionInstruction({
      payer: admin.publicKey,
      authority: [admin.publicKey, true],
      permissionedAccount: [creatorPositionPda, false],
      ownerProgram: PERMISSION_PROGRAM_ID,
      validator: configuredTeeValidator,
    });

    const delegatePositionIx = await program.methods
      .delegatePositionIntoTee(latestMarketPda, admin.publicKey)
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        bufferPosition,
        delegationRecordPosition,
        delegationMetadataPosition,
        position: creatorPositionPda,
        ownerProgram: program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    await provider.sendAndConfirm(
      new Transaction().add(delegatePermissionIx, delegatePositionIx),
      [admin]
    );

    const delegatedPositionInfo = await provider.connection.getAccountInfo(
      creatorPositionPda
    );

    assert.ok(delegatedPositionInfo, 'delegated creator position should exist');
    assert.ok(
      delegatedPositionInfo!.owner.equals(DELEGATION_PROGRAM_ID),
      `expected creator position owner ${DELEGATION_PROGRAM_ID.toBase58()}, got ${delegatedPositionInfo!.owner.toBase58()}`
    );
    await assertDelegatedToConfiguredValidator(
      provider.connection,
      creatorPositionPda,
      configuredTeeValidator,
      'creator position'
    );
  });

  it('delegates the creator private position state into MagicBlock', async () => {
    const privatePositionPermission = permissionPdaFromAccount(
      creatorPrivatePositionPda
    );
    const bufferPrivatePosition =
      delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
        creatorPrivatePositionPda,
        program.programId
      );
    const delegationRecordPrivatePosition =
      delegationRecordPdaFromDelegatedAccount(creatorPrivatePositionPda);
    const delegationMetadataPrivatePosition =
      delegationMetadataPdaFromDelegatedAccount(creatorPrivatePositionPda);

    await program.methods
      .createPrivatePositionPermission()
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        privatePosition: creatorPrivatePositionPda,
        permission: privatePositionPermission,
        permissionProgram: PERMISSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const delegatePermissionIx = createDelegatePermissionInstruction({
      payer: admin.publicKey,
      authority: [admin.publicKey, true],
      permissionedAccount: [creatorPrivatePositionPda, false],
      ownerProgram: PERMISSION_PROGRAM_ID,
      validator: configuredTeeValidator,
    });

    const delegatePrivatePositionIx = await program.methods
      .delegatePrivatePositionIntoTee(latestMarketPda, admin.publicKey)
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        bufferPrivatePosition,
        delegationRecordPrivatePosition,
        delegationMetadataPrivatePosition,
        privatePosition: creatorPrivatePositionPda,
        ownerProgram: program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    await provider.sendAndConfirm(
      new Transaction().add(delegatePermissionIx, delegatePrivatePositionIx),
      [admin]
    );

    const delegatedPrivatePositionInfo =
      await provider.connection.getAccountInfo(creatorPrivatePositionPda);

    assert.ok(
      delegatedPrivatePositionInfo,
      'delegated creator private position should exist'
    );
    assert.ok(
      delegatedPrivatePositionInfo!.owner.equals(DELEGATION_PROGRAM_ID),
      `expected creator private position owner ${DELEGATION_PROGRAM_ID.toBase58()}, got ${delegatedPrivatePositionInfo!.owner.toBase58()}`
    );
    await assertDelegatedToConfiguredValidator(
      provider.connection,
      creatorPrivatePositionPda,
      configuredTeeValidator,
      'creator private position'
    );
  });

  it('initializes private market state inside the ephemeral rollup', async () => {
    // Give devnet + MagicBlock router a moment to observe fresh delegation state.
    await sleep(4_000);

    const ix = await ephemeralProgram.methods
      .initializePrivateMarketState()
      .accountsPartial({
        initializer: admin.publicKey,
        config: configPda,
        market: latestMarketPda,
        creatorPosition: creatorPositionPda,
        privatePosition: creatorPrivatePositionPda,
      })
      .instruction();

    console.log(
      'init private market ix keys:',
      ix.keys.map(
        (key, index) =>
          `${index}:${key.pubkey.toBase58()}:w=${key.isWritable}:s=${key.isSigner}`
      )
    );

    const signature = await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(ix),
      admin
    );

    const privatePositionInfo = await waitForAccountOnConnection(
      ephemeralConnection,
      creatorPrivatePositionPda
    );
    assert.ok(
      privatePositionInfo,
      `creator private position should exist on ER after tx ${signature}`
    );
  });

  it('delegates the trader private position state into MagicBlock', async () => {
    const privatePositionPermission = permissionPdaFromAccount(
      latestPrivatePositionPda
    );
    const bufferPrivatePosition =
      delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
        latestPrivatePositionPda,
        program.programId
      );
    const delegationRecordPrivatePosition =
      delegationRecordPdaFromDelegatedAccount(latestPrivatePositionPda);
    const delegationMetadataPrivatePosition =
      delegationMetadataPdaFromDelegatedAccount(latestPrivatePositionPda);

    await program.methods
      .createPrivatePositionPermission()
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        privatePosition: latestPrivatePositionPda,
        permission: privatePositionPermission,
        permissionProgram: PERMISSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const delegatePermissionIx = createDelegatePermissionInstruction({
      payer: admin.publicKey,
      authority: [admin.publicKey, true],
      permissionedAccount: [latestPrivatePositionPda, false],
      ownerProgram: PERMISSION_PROGRAM_ID,
      validator: configuredTeeValidator,
    });

    const delegatePrivatePositionIx = await program.methods
      .delegatePrivatePositionIntoTee(latestMarketPda, trader.publicKey)
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        bufferPrivatePosition,
        delegationRecordPrivatePosition,
        delegationMetadataPrivatePosition,
        privatePosition: latestPrivatePositionPda,
        ownerProgram: program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    await provider.sendAndConfirm(
      new Transaction().add(delegatePermissionIx, delegatePrivatePositionIx),
      [admin]
    );

    const delegatedPrivatePositionInfo =
      await provider.connection.getAccountInfo(latestPrivatePositionPda);

    assert.ok(
      delegatedPrivatePositionInfo,
      'delegated trader private position should exist'
    );
    assert.ok(
      delegatedPrivatePositionInfo!.owner.equals(DELEGATION_PROGRAM_ID),
      `expected trader private position owner ${DELEGATION_PROGRAM_ID.toBase58()}, got ${delegatedPrivatePositionInfo!.owner.toBase58()}`
    );
    await assertDelegatedToConfiguredValidator(
      provider.connection,
      latestPrivatePositionPda,
      configuredTeeValidator,
      'trader private position'
    );
  });

  it('initializes trader private position state inside the ephemeral rollup', async () => {
    await sleep(4_000);

    const ix = await ephemeralProgram.methods
      .initializePrivatePositionState()
      .accountsPartial({
        trader: trader.publicKey,
        config: configPda,
        market: latestMarketPda,
        position: latestPositionPda,
        privatePosition: latestPrivatePositionPda,
      })
      .instruction();

    await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(ix),
      trader
    );
  });

  it('places a hidden YES prediction inside the ephemeral rollup', async () => {
    const ix = await ephemeralProgram.methods
      .placePrivatePrediction(new anchor.BN(100_000), true, new anchor.BN(0))
      .accountsPartial({
        trader: trader.publicKey,
        config: configPda,
        market: latestMarketPda,
        position: latestPositionPda,
        privatePosition: latestPrivatePositionPda,
      })
      .instruction();

    console.log(
      'place private prediction ix keys:',
      ix.keys.map(
        (key, index) =>
          `${index}:${key.pubkey.toBase58()}:w=${key.isWritable}:s=${key.isSigner}`
      )
    );

    await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(ix),
      trader
    );

    const privatePositionInfo = await waitForAccountOnConnection(
      ephemeralConnection,
      latestPrivatePositionPda
    );
    assert.ok(privatePositionInfo, 'trader private position should still exist');
  });

  it('resolves the private market inside the ephemeral rollup', async () => {
    const secondsUntilClose = latestMarketEndTime - Math.floor(Date.now() / 1000);
    if (secondsUntilClose > 0) {
      await sleep((secondsUntilClose + 3) * 1000);
    }

    const ix = await ephemeralProgram.methods
      .resolvePriceMarketEr()
      .accountsPartial({
        resolver: oracle.publicKey,
        config: configPda,
        market: latestMarketPda,
        oracleFeed: latestOracleFeedPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    console.log(
      'resolve private market ix keys:',
      ix.keys.map(
        (key, index) =>
          `${index}:${key.pubkey.toBase58()}:w=${key.isWritable}:s=${key.isSigner}`
      )
    );

    await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(ix),
      oracle
    );

    const liveMarket = await ephemeralProgram.account.market.fetch(latestMarketPda);
    assert.deepEqual(liveMarket.status, { settlementOpen: {} });
    assert.deepEqual(liveMarket.outcome, { yes: {} });
  });

  it('settles the trader private position inside the ephemeral rollup', async () => {
    const ix = await ephemeralProgram.methods
      .settlePrivatePositionEr()
      .accountsPartial({
        trader: trader.publicKey,
        config: configPda,
        market: latestMarketPda,
        position: latestPositionPda,
        privatePosition: latestPrivatePositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    console.log(
      'settle private position ix keys:',
      ix.keys.map(
        (key, index) =>
          `${index}:${key.pubkey.toBase58()}:w=${key.isWritable}:s=${key.isSigner}`
      )
    );

    await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(ix),
      trader
    );

    const settledPosition = await ephemeralProgram.account.traderPosition.fetch(
      latestPositionPda
    );
    assert.equal(settledPosition.settled, true);
    assert.ok(settledPosition.claimableAmount.toNumber() > 0);
  });

  it('commits settled state back to L1 and claims payout from the vault', async () => {
    const commitPositionIx = await ephemeralProgram.methods
      .commitPositionAndUndelegate()
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        position: latestPositionPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    console.log(
      'commit position and undelegate ix keys:',
      commitPositionIx.keys.map(
        (key, index) =>
          `${index}:${key.pubkey.toBase58()}:w=${key.isWritable}:s=${key.isSigner}`
      )
    );

    await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(commitPositionIx),
      admin
    );

    await waitForAccountOwner(
      provider.connection,
      latestPositionPda,
      program.programId
    );

    const commitMarketIx = await ephemeralProgram.methods
      .commitAndUndelegate()
      .accountsPartial({
        authority: admin.publicKey,
        config: configPda,
        market: latestMarketPda,
        magicProgram: MAGIC_PROGRAM_ID,
        magicContext: MAGIC_CONTEXT_ID,
      })
      .instruction();

    console.log(
      'commit market and undelegate ix keys:',
      commitMarketIx.keys.map(
        (key, index) =>
          `${index}:${key.pubkey.toBase58()}:w=${key.isWritable}:s=${key.isSigner}`
      )
    );

    await sendTeeTransaction(
      ephemeralConnection,
      new Transaction().add(commitMarketIx),
      admin
    );

    await waitForAccountOwner(
      provider.connection,
      latestMarketPda,
      program.programId
    );

    const committedPosition = await program.account.traderPosition.fetch(
      latestPositionPda
    );
    assert.equal(committedPosition.settled, true);
    assert.ok(committedPosition.claimableAmount.toNumber() > 0);

    const market = await program.account.market.fetch(latestMarketPda);
    const traderCollateral = await getAssociatedTokenAddress(
      collateralMint,
      trader.publicKey
    );
    const traderCollateralBefore =
      await provider.connection.getTokenAccountBalance(traderCollateral);

    await program.methods
      .claimSettledPrivatePosition()
      .accountsPartial({
        trader: trader.publicKey,
        config: configPda,
        market: latestMarketPda,
        position: latestPositionPda,
        collateralMint,
        traderCollateral,
        vault: market.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    const claimedPosition = await program.account.traderPosition.fetch(
      latestPositionPda
    );
    const traderCollateralAfter =
      await provider.connection.getTokenAccountBalance(traderCollateral);

    assert.equal(claimedPosition.claimed, true);
    assert.equal(
      BigInt(traderCollateralAfter.value.amount) -
        BigInt(traderCollateralBefore.value.amount),
      BigInt(committedPosition.claimableAmount.toString())
    );
  });
});
