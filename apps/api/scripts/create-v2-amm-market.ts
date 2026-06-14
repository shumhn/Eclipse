/**
 * Create V2 AMM Market (Simple Version)
 *
 * From CORE SDK docs - this is the simpler market creation
 * that uses CORE's default oracle for settlement.
 */

import { PublicKey } from '@solana/web3.js';
import { COREClient } from 'core-sdk';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  console.log('='.repeat(70));
  console.log('🏗️  Create V2 AMM Market (Simple)');
  console.log('='.repeat(70));

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const privateKey = process.env.SOLANA_PRIVATE_KEY!;

  console.log('\n📡 RPC:', rpcUrl);

  // Initialize client
  const client = new COREClient(rpcUrl, privateKey);
  console.log('✅ Client initialized');

  // Check if market module is available
  if (!client.market) {
    console.log('❌ Market module not available');
    console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
    return;
  }

  console.log('✅ Market module available');
  console.log('   Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client.market)));

  // Market parameters
  const question = `Will BTC reach $150,000 by February 2026? (Test: ${Date.now()})`;
  const initialLiquidity = 1_000_000n; // 1 token (6 decimals)
  const endTime = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60); // 30 days

  // Use the token we have in our wallet
  const collateralMint = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

  console.log('\n📋 Market Parameters:');
  console.log('   Question:', question);
  console.log('   Initial Liquidity:', initialLiquidity.toString());
  console.log('   End Time:', new Date(Number(endTime) * 1000).toISOString());
  console.log('   Collateral Mint:', collateralMint.toString());

  console.log('\n🚀 Creating V2 AMM Market...');

  try {
    const result = await client.market.createMarket({
      question,
      initialLiquidity,
      endTime,
      baseMint: collateralMint,
    });

    console.log('\n✅ SUCCESS! Market created!');
    console.log('   Signature:', result.signature);
    if (result.market) {
      console.log('   Market Address:', result.market.toString());
    }
    console.log('   Full result:', JSON.stringify(result, (k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    , 2));

  } catch (error: any) {
    console.log('\n❌ Failed:', error.message || error);

    if (error.transactionLogs) {
      console.log('\n📜 Transaction Logs:');
      for (const log of error.transactionLogs) {
        console.log('   ', log);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('🏁 Complete');
  console.log('='.repeat(70));
}

main().catch(console.error);
