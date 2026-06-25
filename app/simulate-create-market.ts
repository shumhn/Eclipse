import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import IDL from './target/idl/prediction_market.json';
import fs from 'fs';

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const PROGRAM_ID = new PublicKey('79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t');
  
  // Use a random keypair for simulation
  const creator = Keypair.generate();
  
  const provider = new AnchorProvider(connection, {
    publicKey: creator.publicKey,
    signTransaction: async (tx) => { tx.sign(creator); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(creator)); return txs; }
  }, {});
  
  const program = new Program(IDL as any, provider);
  
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
  
  // Fake market count 1
  const marketCountBuf = Buffer.alloc(8);
  marketCountBuf.writeBigUInt64LE(BigInt(1));
  const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), marketCountBuf], PROGRAM_ID);
  
  const collateralMint = new PublicKey('11111111111111111111111111111111'); // arbitrary for simulation
  const creatorCollateral = splToken.getAssociatedTokenAddressSync(collateralMint, creator.publicKey);
  const vault = splToken.getAssociatedTokenAddressSync(collateralMint, marketPda, true);
  
  const [creatorPositionPda] = PublicKey.findProgramAddressSync([Buffer.from('position'), marketPda.toBuffer(), creator.publicKey.toBuffer()], PROGRAM_ID);
  const [creatorPrivatePositionPda] = PublicKey.findProgramAddressSync([Buffer.from('private_position_state'), marketPda.toBuffer(), creator.publicKey.toBuffer()], PROGRAM_ID);
  
  const createMethod = program.methods.createPrivateMarket(
    "Will this work?",
    new (require('bn.js'))(Date.now() / 1000 + 86400),
    new (require('bn.js'))(1000000)
  );

  const createIx = await createMethod
    .accounts({
      creator: creator.publicKey,
      config: configPda,
      market: marketPda,
      creatorPosition: creatorPositionPda,
      creatorPrivatePosition: creatorPrivatePositionPda,
      collateralMint,
      creatorCollateral,
      vault,
      tokenProgram: splToken.TOKEN_PROGRAM_ID,
      associatedTokenProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
    
  const tx = new Transaction().add(createIx);
  tx.feePayer = creator.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  
  try {
    const sim = await connection.simulateTransaction(tx);
    console.log(JSON.stringify(sim.value.logs, null, 2));
    console.log(sim.value.err);
  } catch (e) {
    console.error(e);
  }
}
main().catch(console.error);
