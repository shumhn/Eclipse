import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// DAC Token Program ID
const DAC_TOKEN_PROGRAM_ID = new PublicKey('ByaYNFzb2fPCkWLJCMEY4tdrfNqEAKAPJB3kDX86W5Rq');

// Inco Lightning Program ID
const INCO_LIGHTNING_PROGRAM_ID = new PublicKey('5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj');

// USDC Devnet Mint
const USDC_DEVNET_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

const RPC_URL = 'https://api.devnet.solana.com';

// Find PDAs
function findDacMintPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('dac_mint')],
    DAC_TOKEN_PROGRAM_ID
  );
}

function findVaultPda(dacMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), dacMint.toBuffer()],
    DAC_TOKEN_PROGRAM_ID
  );
}

async function main() {
  // Load keypair from default Solana config
  const keypairPath = path.join(process.env.HOME!, '.config/solana/id.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log('Payer:', payer.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(payer.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');

  // Find PDAs
  const [dacMint, dacMintBump] = findDacMintPda();
  const [vault, vaultBump] = findVaultPda(dacMint);

  console.log('\nPDAs:');
  console.log('DAC Mint:', dacMint.toBase58());
  console.log('Vault:', vault.toBase58());

  // Check if already initialized
  const dacMintInfo = await connection.getAccountInfo(dacMint);
  if (dacMintInfo) {
    console.log('\nDAC Mint is already initialized!');
    console.log('Account size:', dacMintInfo.data.length, 'bytes');
    return;
  }

  console.log('\nInitializing DAC Mint...');

  // Build the initialize_mint instruction manually
  // Instruction discriminator for initialize_mint: [209, 42, 195, 4, 129, 85, 209, 44]
  const discriminator = Buffer.from([209, 42, 195, 4, 129, 85, 209, 44]);
  const decimals = Buffer.from([6]); // 6 decimals like USDC

  const data = Buffer.concat([discriminator, decimals]);

  const instruction = {
    keys: [
      { pubkey: dacMint, isSigner: false, isWritable: true },
      { pubkey: USDC_DEVNET_MINT, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: INCO_LIGHTNING_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: DAC_TOKEN_PROGRAM_ID,
    data,
  };

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  try {
    const signature = await connection.sendTransaction(transaction, [payer], {
      skipPreflight: false,
    });
    console.log('Transaction sent:', signature);

    await connection.confirmTransaction(signature, 'confirmed');
    console.log('Transaction confirmed!');

    // Verify initialization
    const newDacMintInfo = await connection.getAccountInfo(dacMint);
    if (newDacMintInfo) {
      console.log('\nDAC Mint initialized successfully!');
      console.log('DAC Mint Address:', dacMint.toBase58());
      console.log('Vault Address:', vault.toBase58());
    }
  } catch (error) {
    console.error('Error initializing DAC Mint:', error);
  }
}

main().catch(console.error);
