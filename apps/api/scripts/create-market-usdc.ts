/**
 * Create CORE Market with USDC as Collateral
 *
 * Based on CORE SDK docs: https://docs.core.exchange
 *
 * Key insight from docs:
 * - client.market.createMarket() for V2 AMM markets
 * - Can use ANY SPL token as baseMint (collateral)
 */

import { COREClient } from 'core-sdk';
import { PublicKey, Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import path from 'path';

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Token addresses
const TOKENS = {
  // Mainnet USDC (also works on devnet for some programs)
  USDC_MAINNET: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // Circle devnet USDC faucet token
  USDC_DEVNET: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  // Wrapped SOL
  WSOL: 'So11111111111111111111111111111111111111112',
};

async function main() {
  console.log('='.repeat(70));
  console.log('🏗️  CORE Market Creation with USDC');
  console.log('='.repeat(70));

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const privateKey = process.env.SOLANA_PRIVATE_KEY!;

  if (!privateKey) {
    throw new Error('SOLANA_PRIVATE_KEY not set in environment');
  }

  console.log('\n📡 RPC:', rpcUrl);

  // Initialize connection and keypair
  const connection = new Connection(rpcUrl, 'confirmed');
  const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));

  console.log('👛 Wallet:', keypair.publicKey.toString());

  // Check SOL balance
  const solBalance = await connection.getBalance(keypair.publicKey);
  console.log('💰 SOL Balance:', (solBalance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

  // ════════════════════════════════════════════════════════════
  // Check USDC balances
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '━'.repeat(70));
  console.log('💵 Checking USDC Balances');
  console.log('━'.repeat(70));

  // Check for USDC tokens
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  });

  console.log(`\n   Found ${tokenAccounts.value.length} token accounts:`);

  let usdcBalance = 0n;
  let usdcMint = '';

  for (const account of tokenAccounts.value) {
    const info = account.account.data.parsed.info;
    const mint = info.mint;
    const balance = info.tokenAmount;

    // Check if it's USDC (mainnet or devnet)
    if (mint === TOKENS.USDC_MAINNET || mint === TOKENS.USDC_DEVNET) {
      console.log(`   ✅ USDC Found!`);
      console.log(`      Mint: ${mint}`);
      console.log(`      Balance: ${balance.uiAmountString} USDC (${balance.amount} raw)`);
      usdcBalance = BigInt(balance.amount);
      usdcMint = mint;
    } else if (BigInt(balance.amount) > 0n) {
      console.log(`   📦 Token: ${mint.slice(0, 20)}...`);
      console.log(`      Balance: ${balance.uiAmountString} (${balance.decimals} decimals)`);
    }
  }

  if (usdcBalance === 0n) {
    console.log('\n   ⚠️  No USDC found. Checking if we can use other tokens...');

    // Try to find any token with balance
    for (const account of tokenAccounts.value) {
      const info = account.account.data.parsed.info;
      if (BigInt(info.tokenAmount.amount) > 0n) {
        usdcMint = info.mint;
        usdcBalance = BigInt(info.tokenAmount.amount);
        console.log(`   Using token: ${usdcMint}`);
        console.log(`   Balance: ${info.tokenAmount.uiAmountString}`);
        break;
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // Initialize CORE Client
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '━'.repeat(70));
  console.log('🔌 Initializing CORE Client');
  console.log('━'.repeat(70));

  const client = new COREClient(rpcUrl, privateKey);
  console.log('   ✅ Client initialized');

  // Check available modules
  console.log('\n   Available modules:');
  console.log('   - market:', !!client.market);
  console.log('   - trading:', !!client.trading);
  console.log('   - redemption:', !!client.redemption);

  if (!client.market) {
    throw new Error('Market module not available. Check private key.');
  }

  // List market module methods
  const marketMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.market))
    .filter(m => m !== 'constructor');
  console.log('   - market methods:', marketMethods);

  // ════════════════════════════════════════════════════════════
  // Create Market
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '━'.repeat(70));
  console.log('🚀 Creating Market');
  console.log('━'.repeat(70));

  // Market parameters
  const question = `Will SOL price reach $300 in the next 5 hours? (Test: ${Date.now()})`;
  const initialLiquidity = 1_000_000n; // 1 USDC (6 decimals)
  const endTime = BigInt(Math.floor(Date.now() / 1000) + 5 * 60 * 60); // 5 hours from now

  // Try different collateral tokens in order of preference
  const tokensToTry = [
    { name: 'USDC (Mainnet format)', mint: TOKENS.USDC_MAINNET },
    { name: 'USDC (Devnet Circle)', mint: TOKENS.USDC_DEVNET },
    { name: 'Wrapped SOL', mint: TOKENS.WSOL },
  ];

  // If we found a token with balance, try that first
  if (usdcMint && usdcBalance > 0n) {
    tokensToTry.unshift({ name: 'Wallet Token', mint: usdcMint });
  }

  console.log('\n   📋 Market Parameters:');
  console.log(`   Question: ${question}`);
  console.log(`   Initial Liquidity: ${initialLiquidity.toString()} (1 token with 6 decimals)`);
  console.log(`   End Time: ${new Date(Number(endTime) * 1000).toISOString()}`);

  let marketCreated = false;

  for (const token of tokensToTry) {
    console.log(`\n   ${'─'.repeat(50)}`);
    console.log(`   Trying with: ${token.name}`);
    console.log(`   Mint: ${token.mint}`);

    try {
      const baseMint = new PublicKey(token.mint);

      console.log('\n   Calling client.market.createMarket()...');

      const result = await client.market.createMarket({
        question,
        initialLiquidity,
        endTime,
        baseMint,
      });

      console.log('\n   ✅ SUCCESS! Market created!');
      console.log('   Signature:', result.signature);

      if (result.market) {
        const marketAddress = typeof result.market.toBase58 === 'function'
          ? result.market.toBase58()
          : result.market.toString();
        console.log('   Market Address:', marketAddress);

        // Verify market was created
        console.log('\n   Verifying market...');
        try {
          const marketData = await client.fetchMarket(result.market);
          console.log('   ✅ Market verified!');
          console.log('   Question:', marketData.account.question);
          console.log('   Creator:', new PublicKey(marketData.account.creator).toString());
          console.log('   Resolved:', marketData.account.resolved);
        } catch (e) {
          console.log('   ⚠️  Could not verify market:', (e as Error).message);
        }
      }

      marketCreated = true;
      break;

    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message?.slice(0, 100) || error}`);

      // Show transaction logs if available
      if (error.transactionLogs) {
        console.log('\n   Transaction logs:');
        for (const log of error.transactionLogs.slice(0, 5)) {
          console.log(`   ${log}`);
        }
      }

      // Check specific error conditions
      if (error.message?.includes('global_config')) {
        console.log('   → Global config not initialized for this program');
      } else if (error.message?.includes('insufficient')) {
        console.log('   → Insufficient token balance');
      } else if (error.message?.includes('TokenAccountNotFoundError')) {
        console.log('   → No token account for this mint');
      }
    }
  }

  if (!marketCreated) {
    console.log('\n' + '━'.repeat(70));
    console.log('❌ All attempts failed');
    console.log('━'.repeat(70));
    console.log(`
Possible reasons:
1. Global config not initialized on devnet for the V2 program
2. Missing token accounts for the collateral
3. Insufficient balance

The existing devnet markets may have been created with a different
program version or by the CORE team with special permissions.

Alternative: Use existing markets for the hackathon demo.
`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🏁 Complete');
  console.log('='.repeat(70));
}

main().catch(console.error);
