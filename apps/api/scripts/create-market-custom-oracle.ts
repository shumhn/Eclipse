/**
 * Create CORE Market with Custom Oracle
 *
 * According to CORE SDK docs:
 * > **New in v0.2.6**: The `createMarketWithCustomOracle` function is now live
 * > on both **Devnet** and **Mainnet**!
 *
 * This method allows us to be our own oracle and create markets on devnet.
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
  USDC_MAINNET: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDC_DEVNET: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  WSOL: 'So11111111111111111111111111111111111111112',
};

async function main() {
  console.log('='.repeat(70));
  console.log('🏗️  CORE Market Creation with Custom Oracle');
  console.log('='.repeat(70));

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const privateKey = process.env.SOLANA_PRIVATE_KEY!;

  if (!privateKey) {
    throw new Error('SOLANA_PRIVATE_KEY not set');
  }

  console.log('\n📡 RPC:', rpcUrl);

  const connection = new Connection(rpcUrl, 'confirmed');
  const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));

  console.log('👛 Wallet:', keypair.publicKey.toString());

  // Check SOL balance
  const solBalance = await connection.getBalance(keypair.publicKey);
  console.log('💰 SOL Balance:', (solBalance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

  // Check token balances
  console.log('\n💵 Checking token balances...');
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  });

  let bestToken = { mint: '', balance: 0n, decimals: 6, name: '' };

  for (const account of tokenAccounts.value) {
    const info = account.account.data.parsed.info;
    const mint = info.mint;
    const balance = BigInt(info.tokenAmount.amount);
    const decimals = info.tokenAmount.decimals;

    if (balance > 0n) {
      let name = 'Unknown';
      if (mint === TOKENS.USDC_MAINNET) name = 'USDC (Mainnet)';
      else if (mint === TOKENS.USDC_DEVNET) name = 'USDC (Devnet)';

      console.log(`   ${name}: ${info.tokenAmount.uiAmountString} (${balance} raw)`);
      console.log(`   Mint: ${mint}`);

      if (balance > bestToken.balance) {
        bestToken = { mint, balance, decimals, name };
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

  // Check if createMarketWithCustomOracle exists
  const clientMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
    .filter(m => m !== 'constructor');
  console.log('\n   Client methods:', clientMethods.slice(0, 15));

  const hasCustomOracle = typeof (client as any).createMarketWithCustomOracle === 'function';
  console.log('   createMarketWithCustomOracle available:', hasCustomOracle);

  // ════════════════════════════════════════════════════════════
  // Create Market with Custom Oracle
  // ════════════════════════════════════════════════════════════
  console.log('\n' + '━'.repeat(70));
  console.log('🚀 Creating Market with Custom Oracle');
  console.log('━'.repeat(70));

  // Market parameters
  const question = `Will SOL price reach $300 in the next 5 hours? (Test: ${Date.now()})`;
  const initialLiquidity = 1_000_000n; // 1 token with 6 decimals
  const endTime = BigInt(Math.floor(Date.now() / 1000) + 5 * 60 * 60); // 5 hours

  // We'll be our own oracle
  const oracleAddress = keypair.publicKey;

  console.log('\n   📋 Market Parameters:');
  console.log(`   Question: ${question.slice(0, 60)}...`);
  console.log(`   Initial Liquidity: ${initialLiquidity.toString()}`);
  console.log(`   End Time: ${new Date(Number(endTime) * 1000).toISOString()}`);
  console.log(`   Oracle (us): ${oracleAddress.toString()}`);

  // Try different collateral mints
  const mintsToTry = [
    { name: 'Our token', mint: bestToken.mint },
    { name: 'USDC Mainnet', mint: TOKENS.USDC_MAINNET },
    { name: 'USDC Devnet', mint: TOKENS.USDC_DEVNET },
  ].filter(m => m.mint); // Filter out empty mints

  for (const tokenInfo of mintsToTry) {
    console.log(`\n   ${'─'.repeat(50)}`);
    console.log(`   Trying: ${tokenInfo.name}`);
    console.log(`   Mint: ${tokenInfo.mint}`);

    try {
      if (hasCustomOracle) {
        console.log('\n   Using createMarketWithCustomOracle()...');

        const result = await (client as any).createMarketWithCustomOracle({
          question,
          initialLiquidity,
          endTime,
          collateralMint: new PublicKey(tokenInfo.mint),
          settlerAddress: oracleAddress,
          yesOddsBps: 5000, // 50/50 odds
        });

        console.log('\n   ✅ SUCCESS! Market created!');
        console.log('   Signature:', result.signature);

        if (result.market) {
          console.log('   Market:', result.market.toString());

          // IMPORTANT: Enable trading within 15 minutes!
          console.log('\n   ⏰ IMPORTANT: Enabling trading (15-min buffer)...');

          try {
            const enableResult = await (client as any).setMarketResolvable(
              result.market,
              true
            );
            console.log('   ✅ Trading enabled!');
            console.log('   Signature:', enableResult.signature);
          } catch (e) {
            console.log('   ⚠️  Could not enable trading:', (e as Error).message.slice(0, 80));
          }
        }

        console.log('\n   🎉 Market successfully created and ready for trading!');
        return; // Success!

      } else {
        // Fallback to regular createMarket
        console.log('\n   createMarketWithCustomOracle not found, trying regular method...');

        const result = await client.market!.createMarket({
          question,
          initialLiquidity,
          endTime,
          baseMint: new PublicKey(tokenInfo.mint),
        });

        console.log('\n   ✅ SUCCESS!');
        console.log('   Signature:', result.signature);
        if (result.market) {
          console.log('   Market:', result.market.toString());
        }
        return;
      }

    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message?.slice(0, 100) || error}`);

      if (error.transactionLogs) {
        console.log('\n   Logs:');
        for (const log of error.transactionLogs.slice(0, 5)) {
          console.log(`   ${log}`);
        }
      }
    }
  }

  console.log('\n' + '━'.repeat(70));
  console.log('❌ All attempts failed');
  console.log('━'.repeat(70));

  // Check SDK version
  console.log('\n   Checking SDK info...');
  try {
    const pkgPath = require.resolve('core-sdk/package.json');
    const pkg = require(pkgPath);
    console.log('   SDK Version:', pkg.version);
  } catch (e) {
    console.log('   Could not get SDK version');
  }

  console.log('\n' + '='.repeat(70));
  console.log('🏁 Complete');
  console.log('='.repeat(70));
}

main().catch(console.error);
