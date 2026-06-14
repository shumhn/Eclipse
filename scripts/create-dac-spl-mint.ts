/**
 * Create DAC as a standard SPL Token
 *
 * This creates a proper SPL token mint that CORE can accept as collateral.
 * The mint authority is set to a PDA from our DAC program, so we control minting.
 *
 * Flow:
 * 1. Create standard SPL token mint (owned by Token Program)
 * 2. Set mint authority to our program's PDA
 * 3. Create USDC vault for backing
 * 4. Our program handles wrap (mint) and unwrap (burn)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getMint,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  createSetAuthorityInstruction,
  AuthorityType,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// Our DAC program ID
const DAC_PROGRAM_ID = new PublicKey('ByaYNFzb2fPCkWLJCMEY4tdrfNqEAKAPJB3kDX86W5Rq');

// USDC Devnet mint
const USDC_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

const RPC_URL = 'https://api.devnet.solana.com';

/**
 * Find the mint authority PDA for our DAC program
 */
function findMintAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('mint_authority')],
    DAC_PROGRAM_ID
  );
}

/**
 * Find the vault PDA for holding USDC
 */
function findVaultPda(dacMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), dacMint.toBuffer()],
    DAC_PROGRAM_ID
  );
}

async function main() {
  // Load keypair
  const keypairPath = path.join(process.env.HOME!, '.config/solana/id.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log('Payer:', payer.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(payer.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');

  // Find PDAs
  const [mintAuthority, mintAuthorityBump] = findMintAuthorityPda();
  console.log('\nMint Authority PDA:', mintAuthority.toBase58());
  console.log('Mint Authority Bump:', mintAuthorityBump);

  // Generate a new keypair for the DAC mint
  const dacMintKeypair = Keypair.generate();
  const dacMint = dacMintKeypair.publicKey;
  console.log('\nDAC Mint Address:', dacMint.toBase58());

  const [vaultPda, vaultBump] = findVaultPda(dacMint);
  console.log('Vault PDA:', vaultPda.toBase58());

  // Check if mint already exists
  try {
    const existingMint = await getMint(connection, dacMint);
    console.log('\nMint already exists!');
    console.log('Supply:', existingMint.supply.toString());
    console.log('Decimals:', existingMint.decimals);
    console.log('Mint Authority:', existingMint.mintAuthority?.toBase58());
    return;
  } catch {
    // Mint doesn't exist, continue
  }

  console.log('\n--- Creating DAC SPL Token Mint ---\n');

  // Step 1: Create the mint account
  const lamports = await getMinimumBalanceForRentExemptMint(connection);

  const createMintTx = new Transaction().add(
    // Create account for mint
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: dacMint,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    // Initialize mint with payer as initial authority
    createInitializeMintInstruction(
      dacMint,
      6, // 6 decimals like USDC
      payer.publicKey, // Initial mint authority (we'll transfer to PDA)
      null, // No freeze authority
      TOKEN_PROGRAM_ID,
    ),
  );

  console.log('Creating mint account...');
  const createSig = await sendAndConfirmTransaction(
    connection,
    createMintTx,
    [payer, dacMintKeypair],
  );
  console.log('Create signature:', createSig);

  // Step 2: Transfer mint authority to our program's PDA
  const setAuthorityTx = new Transaction().add(
    createSetAuthorityInstruction(
      dacMint,
      payer.publicKey, // Current authority
      AuthorityType.MintTokens,
      mintAuthority, // New authority (our PDA)
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  console.log('\nTransferring mint authority to PDA...');
  const authSig = await sendAndConfirmTransaction(
    connection,
    setAuthorityTx,
    [payer],
  );
  console.log('Authority transfer signature:', authSig);

  // Verify
  const mintInfo = await getMint(connection, dacMint);
  console.log('\n--- DAC Token Created ---');
  console.log('Mint Address:', dacMint.toBase58());
  console.log('Decimals:', mintInfo.decimals);
  console.log('Mint Authority:', mintInfo.mintAuthority?.toBase58());
  console.log('Supply:', mintInfo.supply.toString());

  if (mintInfo.mintAuthority?.equals(mintAuthority)) {
    console.log('\nMint authority successfully set to program PDA!');
    console.log('This mint can be used as collateral in CORE markets.');
  } else {
    console.log('\nWARNING: Mint authority is not the expected PDA');
  }

  // Save the mint address for future use
  const envLine = `\n# DAC SPL Token Mint (created ${new Date().toISOString()})\nDAC_SPL_MINT=${dacMint.toBase58()}\n`;
  console.log('\n--- Add to .env ---');
  console.log(envLine);
}

main().catch(console.error);
