const { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const { Program, AnchorProvider, BN } = require('@coral-xyz/anchor');
const IDL = require('../target/idl/prediction_market.json');
const fs = require('fs');

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const PROGRAM_ID = new PublicKey('79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t');
  
  const keypairFile = fs.readFileSync('/Users/sumangiri/Desktop/Homie/keys/payroll-authority.json');
  const creator = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairFile.toString())));
  
  const provider = new AnchorProvider(connection, {
    publicKey: creator.publicKey,
    signTransaction: async (tx) => { tx.sign(creator); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(creator)); return txs; }
  }, {});
  
  const program = new Program(IDL, provider);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
  
  // Custom fetch since TS doesn't like .config
  const configData = await connection.getAccountInfo(configPda);
  const decodedConfig = program.coder.accounts.decode('Config', configData.data);
  console.log("MARKET COUNT:", decodedConfig.marketCount.toString());
  
  const marketCountBuf = Buffer.alloc(8);
  marketCountBuf.writeBigUInt64LE(BigInt(decodedConfig.marketCount.toString()));
  const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), marketCountBuf], PROGRAM_ID);
  
  const collateralMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  const creatorCollateral = splToken.getAssociatedTokenAddressSync(collateralMint, creator.publicKey);
  const vault = splToken.getAssociatedTokenAddressSync(collateralMint, marketPda, true);
  
  const [creatorPositionPda] = PublicKey.findProgramAddressSync([Buffer.from('position'), marketPda.toBuffer(), creator.publicKey.toBuffer()], PROGRAM_ID);
  const [creatorPrivatePositionPda] = PublicKey.findProgramAddressSync([Buffer.from('private_position_state'), marketPda.toBuffer(), creator.publicKey.toBuffer()], PROGRAM_ID);
  
  const createMethod = program.methods.createPriceMarket(
    "Will BTC be above $66,120?",
    new BN(Date.now() / 1000 + 86400),
    new BN(1000000),
    new BN(0),
    { above: {} },
    new PublicKey("HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J")
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
    
  const tx = new Transaction().add(
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
      ),
      createIx
  );
  
  try {
    const signature = await sendAndConfirmTransaction(connection, tx, [creator], { skipPreflight: false });
    console.log("SUCCESS! Signature:", signature);
  } catch (e) {
    console.error("ERROR:");
    console.error(e.message);
    if (e.logs) {
      console.error("LOGS:");
      console.error(e.logs);
    }
  }
}
main().catch(console.error);
