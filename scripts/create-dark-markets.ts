/**
 * Script to create Dark Markets (prediction markets using DAC as collateral)
 * These markets provide privacy-preserving betting through encrypted balances
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { COREClient } from 'core-sdk';
import * as fs from 'fs';
import * as path from 'path';

// DAC Mint PDA (initialized on devnet)
const DAC_MINT = new PublicKey('4UNGxzRPHLeDtuNYDMm4oJGGLpyYZz4rKeLmdiqenL9x');

const RPC_URL = 'https://api.devnet.solana.com';

// Dark Markets to create - crypto and real-world events
const DARK_MARKETS = [
  {
    question: 'Will Bitcoin reach $150,000 by end of Q2 2025?',
    daysUntilEnd: 180,
    initialLiquidity: 100, // 100 DAC tokens
  },
  {
    question: 'Will Ethereum flip Bitcoin in market cap by 2026?',
    daysUntilEnd: 365,
    initialLiquidity: 100,
  },
  {
    question: 'Will Solana process over 100,000 TPS in production by mid-2025?',
    daysUntilEnd: 150,
    initialLiquidity: 100,
  },
  {
    question: 'Will the Federal Reserve cut rates by more than 100bps in 2025?',
    daysUntilEnd: 300,
    initialLiquidity: 100,
  },
  {
    question: 'Will a major tech company announce Bitcoin holdings in Q1 2025?',
    daysUntilEnd: 60,
    initialLiquidity: 100,
  },
];

async function main() {
  // Load keypair
  const keypairPath = path.join(process.env.HOME!, '.config/solana/id.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log('Creator wallet:', payer.publicKey.toBase58());
  console.log('DAC Mint (collateral):', DAC_MINT.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(payer.publicKey);
  console.log('SOL Balance:', balance / 1e9, 'SOL');

  // Verify DAC mint exists
  const dacMintInfo = await connection.getAccountInfo(DAC_MINT);
  if (!dacMintInfo) {
    console.error('DAC Mint not found! Run init-dac-mint.ts first.');
    process.exit(1);
  }
  console.log('DAC Mint verified on-chain');

  // Initialize CORE client with signer
  const privateKeyBase58 = Buffer.from(keypairData).toString('base64');
  // Note: COREClient expects base58 encoded private key
  const bs58 = await import('bs58');
  const privateKey = bs58.default.encode(Uint8Array.from(keypairData));

  const client = new COREClient(RPC_URL, privateKey);

  console.log('\n--- Creating Dark Markets ---\n');

  for (const market of DARK_MARKETS) {
    console.log(`Creating: "${market.question}"`);

    const endTime = BigInt(Math.floor(Date.now() / 1000) + market.daysUntilEnd * 24 * 60 * 60);
    const initialLiquidity = BigInt(market.initialLiquidity * 1_000_000); // 6 decimals

    try {
      if (!client.market?.createMarket) {
        console.error('CORE SDK market.createMarket not available');
        break;
      }

      const result = await client.market.createMarket({
        question: market.question,
        endTime,
        initialLiquidity,
        baseMint: DAC_MINT, // Use DAC as collateral instead of USDC
      });

      console.log(`  Created! Market: ${result.market?.toBase58() || 'unknown'}`);
      console.log(`  Signature: ${result.signature || 'unknown'}`);
    } catch (error) {
      console.error(`  Failed:`, (error as Error).message);
    }

    // Small delay between market creations
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n--- Dark Markets Creation Complete ---');
  console.log('These markets use DAC (encrypted) tokens as collateral.');
  console.log('User bets are privacy-preserving through FHE.');
}

main().catch(console.error);
