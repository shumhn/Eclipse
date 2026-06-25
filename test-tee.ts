import 'dotenv/config';
import { PublicKey } from '@solana/web3.js';
import { MagicBlockIndexer } from './app/src/services/magicblock-indexer';

async function main() {
  const indexer = new MagicBlockIndexer();
  
  // Need the admin keypair to generate an auth token locally
  const adminKeypair = await (indexer as any).getPreferredOperatorKeypair();
  const conn = await (indexer as any).createAuthenticatedEphemeralConnection(adminKeypair.keypair);
  
  // Extract token from URL
  const token = new URL(conn.rpcEndpoint).searchParams.get('token');
  console.log('Using token length:', token?.length);
  
  const [configPda] = (indexer as any).getConfigPda();
  const configInfo = await conn.getAccountInfo(configPda);
  if (!configInfo) {
    console.log('No global config found!');
    return;
  }
  const config = (indexer as any).decodeGlobalConfig(configInfo.data);
  console.log('Global market count:', config.marketCount);
}

main().catch(console.error);
