import { coreService } from './app/src/services/magicblock-indexer';
import { getDefaultKeypair } from './app/src/lib/keypairUtils'; // wait, no, solana-wallets
import { Keypair } from '@solana/web3.js';
import { getCandidateKeypairs } from './app/src/services/solana-wallets';

async function main() {
  console.log('Testing createPrivacyMarket...');
  const kps = getCandidateKeypairs();
  const creator = kps[0];
  if (!creator) {
    console.error('No operator wallet found');
    return;
  }
  
  console.log('Using wallet:', creator.keypair.publicKey.toBase58());
  
  try {
    const result = await coreService.createPrivacyMarket({
      question: `Test Market ${Date.now()}`,
      endTime: Math.floor(Date.now() / 1000) + 86400,
      initialLiquidity: BigInt(1_000_000), // 1 USDC
    });
    
    console.log('--- MARKET CREATED ---');
    console.log('Market Address:', result.marketAddress);
    console.log('Private State Snapshot:', result.privateStateSnapshot);
    if (!result.privateStateSnapshot) {
      console.error('FAILED: Snapshot is null!');
    } else {
      console.log('SUCCESS! Snapshot was captured.');
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

main();
