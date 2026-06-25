const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const { Program, AnchorProvider } = require('@coral-xyz/anchor');
const IDL = require('../target/idl/prediction_market.json');
const BN = require('bn.js');
const fs = require('fs');

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const PROGRAM_ID = new PublicKey('79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t');
  
  // Use the local authority keypair
  const keypairFile = fs.readFileSync('/Users/sumangiri/Desktop/Homie/keys/payroll-authority.json');
  const creator = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairFile)));
  
  const provider = new AnchorProvider(connection, {
    publicKey: creator.publicKey,
    signTransaction: async (tx) => { tx.sign(creator); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(creator)); return txs; }
  }, {});
  
  const program = new Program(IDL, provider);
  
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
  
  // fetch config to get the real marketCount
  const config = await program.account.config.fetch(configPda);
  console.log("MARKET COUNT IS", config.marketCount.toString());
  
  const marketCountBuf = Buffer.alloc(8);
  marketCountBuf.writeBigUInt64LE(BigInt(config.marketCount.toString()));
  const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), marketCountBuf], PROGRAM_ID);
  
  const collateralMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // USDC devnet
  const creatorCollateral = splToken.getAssociatedTokenAddressSync(collateralMint, creator.publicKey);
  const vault = splToken.getAssociatedTokenAddressSync(collateralMint, marketPda, true);
  
  const [creatorPositionPda] = PublicKey.findProgramAddressSync([Buffer.from('position'), marketPda.toBuffer(), creator.publicKey.toBuffer()], PROGRAM_ID);
  const [creatorPrivatePositionPda] = PublicKey.findProgramAddressSync([Buffer.from('private_position_state'), marketPda.toBuffer(), creator.publicKey.toBuffer()], PROGRAM_ID);
  
  const createMethod = program.methods.createPriceMarket(
    "Will this work?",
    new BN(Date.now() / 1000 + 86400),
    new BN(1000000),
    new BN(0),
    { above: {} },
    new PublicKey("HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J") // arbitrary pyth feed
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
    
  const tx = new Transaction();
  tx.add(
      splToken.createAssociatedTokenAccountIdempotentInstruction(
        creator.publicKey,
        creatorCollateral,
        creator.publicKey,
        collateralMint
      ),
      splToken.createAssociatedTokenAccountIdempotentInstruction(
        creator.publicKey,
        vault,
        marketPda,
        collateralMint
      )
  );
  tx.add(createIx);
  
  tx.feePayer = creator.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  
  try {
    const sim = await connection.simulateTransaction(tx);
    console.log("SIMULATION LOGS:");
    console.log(JSON.stringify(sim.value.logs, null, 2));
    console.log("SIMULATION ERROR:");
    console.log(sim.value.err);
  } catch (e) {
    console.error("CAUGHT ERROR:", e);
  }
}
main().catch(console.error);
