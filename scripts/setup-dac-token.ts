/**
 * Setup DAC Token - Creates SPL mint and initializes program config
 *
 * Flow:
 * 1. Derive the config PDA
 * 2. Derive the mint authority PDA (using config as seed)
 * 3. Create standard SPL token mint with PDA as authority
 * 4. Call initialize instruction to set up config and vault
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMint,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// Program ID
const DAC_PROGRAM_ID = new PublicKey('ByaYNFzb2fPCkWLJCMEY4tdrfNqEAKAPJB3kDX86W5Rq');

// USDC Devnet mint
const USDC_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

const RPC_URL = 'https://api.devnet.solana.com';

// Seeds (must match program)
const CONFIG_SEED = Buffer.from('config');
const MINT_AUTHORITY_SEED = Buffer.from('mint_authority');
const VAULT_AUTHORITY_SEED = Buffer.from('vault_authority');

/**
 * Find config PDA
 */
function findConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], DAC_PROGRAM_ID);
}

/**
 * Find mint authority PDA (seeded by config)
 */
function findMintAuthorityPda(config: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINT_AUTHORITY_SEED, config.toBuffer()],
    DAC_PROGRAM_ID
  );
}

/**
 * Find vault authority PDA (seeded by config)
 */
function findVaultAuthorityPda(config: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_AUTHORITY_SEED, config.toBuffer()],
    DAC_PROGRAM_ID
  );
}

/**
 * Find USDC vault PDA
 */
function findUsdcVaultPda(config: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('usdc_vault'), config.toBuffer()],
    DAC_PROGRAM_ID
  );
}

async function main() {
  // Load keypair
  const keypairPath = path.join(process.env.HOME!, '.config/solana/id.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log('=== DAC Token Setup ===\n');
  console.log('Payer:', payer.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(payer.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL\n');

  // Derive all PDAs
  const [configPda, configBump] = findConfigPda();
  const [mintAuthority, mintAuthorityBump] = findMintAuthorityPda(configPda);
  const [vaultAuthority, vaultAuthorityBump] = findVaultAuthorityPda(configPda);
  const [usdcVault, usdcVaultBump] = findUsdcVaultPda(configPda);

  console.log('--- PDAs ---');
  console.log('Config PDA:', configPda.toBase58(), `(bump: ${configBump})`);
  console.log('Mint Authority PDA:', mintAuthority.toBase58(), `(bump: ${mintAuthorityBump})`);
  console.log('Vault Authority PDA:', vaultAuthority.toBase58(), `(bump: ${vaultAuthorityBump})`);
  console.log('USDC Vault PDA:', usdcVault.toBase58(), `(bump: ${usdcVaultBump})\n`);

  // Check if config already exists
  const configInfo = await connection.getAccountInfo(configPda);
  if (configInfo) {
    console.log('Config already initialized!');
    console.log('Config data size:', configInfo.data.length, 'bytes');
    
    // Try to read the DAC mint from config
    // Skip 8 bytes discriminator, then 32 bytes authority, then 32 bytes dac_mint
    if (configInfo.data.length >= 72) {
      const dacMintBytes = configInfo.data.slice(40, 72);
      const dacMint = new PublicKey(dacMintBytes);
      console.log('DAC Mint (from config):', dacMint.toBase58());
    }
    return;
  }

  // Generate a new keypair for the DAC mint
  const dacMintKeypair = Keypair.generate();
  const dacMint = dacMintKeypair.publicKey;

  console.log('--- Creating DAC SPL Token Mint ---\n');
  console.log('DAC Mint Address:', dacMint.toBase58());
  console.log('Mint Authority will be:', mintAuthority.toBase58());

  // Step 1: Create the mint account with PDA as authority
  const lamports = await getMinimumBalanceForRentExemptMint(connection);

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: dacMint,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      dacMint,
      6, // 6 decimals like USDC
      mintAuthority, // Mint authority is our PDA
      null, // No freeze authority
      TOKEN_PROGRAM_ID
    )
  );

  console.log('Creating DAC mint with PDA as authority...');
  const createSig = await sendAndConfirmTransaction(connection, createMintTx, [
    payer,
    dacMintKeypair,
  ]);
  console.log('Create mint signature:', createSig);

  // Verify mint was created correctly
  const mintInfo = await getMint(connection, dacMint);
  console.log('\nMint created:');
  console.log('  Address:', dacMint.toBase58());
  console.log('  Decimals:', mintInfo.decimals);
  console.log('  Mint Authority:', mintInfo.mintAuthority?.toBase58());
  console.log('  Supply:', mintInfo.supply.toString());

  if (!mintInfo.mintAuthority?.equals(mintAuthority)) {
    console.error('\nERROR: Mint authority is not the expected PDA!');
    return;
  }

  console.log('\n--- Initializing DAC Config ---\n');

  // Step 2: Build the initialize instruction
  // Discriminator for "initialize" (first 8 bytes of SHA256("global:initialize"))
  const discriminator = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

  const initializeIx = {
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: dacMint, isSigner: false, isWritable: false },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: usdcVault, isSigner: false, isWritable: true },
      { pubkey: mintAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: DAC_PROGRAM_ID,
    data: discriminator,
  };

  const initializeTx = new Transaction().add(initializeIx);
  initializeTx.feePayer = payer.publicKey;
  initializeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  console.log('Initializing config...');
  try {
    const initSig = await sendAndConfirmTransaction(connection, initializeTx, [payer]);
    console.log('Initialize signature:', initSig);

    // Verify
    const newConfigInfo = await connection.getAccountInfo(configPda);
    if (newConfigInfo) {
      console.log('\n=== Setup Complete ===\n');
      console.log('DAC Token Program:', DAC_PROGRAM_ID.toBase58());
      console.log('DAC SPL Mint:', dacMint.toBase58());
      console.log('Config PDA:', configPda.toBase58());
      console.log('Mint Authority PDA:', mintAuthority.toBase58());
      console.log('USDC Vault:', usdcVault.toBase58());
      console.log('USDC Mint:', USDC_MINT.toBase58());
      console.log('\nThe DAC mint can now be used as collateral in CORE markets!');
      console.log('\n--- Add to .env ---');
      console.log(`DAC_SPL_MINT=${dacMint.toBase58()}`);
      console.log(`DAC_CONFIG=${configPda.toBase58()}`);
    }
  } catch (error) {
    console.error('Error initializing config:', error);
    // Log the DAC mint anyway since it was created
    console.log('\nDAC Mint was created but config init failed.');
    console.log('DAC Mint:', dacMint.toBase58());
    console.log('You may need to debug the initialize instruction.');
  }
}

main().catch(console.error);
