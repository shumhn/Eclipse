const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const fs = require('fs');

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  const keypairFile = fs.readFileSync('/Users/sumangiri/Desktop/Homie/keys/payroll-authority.json');
  const creator = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairFile.toString())));
  
  const collateralMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  const creatorCollateral = splToken.getAssociatedTokenAddressSync(collateralMint, creator.publicKey);
  
  const tx = new Transaction().add(
      splToken.createAssociatedTokenAccountIdempotentInstruction(
        creator.publicKey,
        creatorCollateral,
        creator.publicKey,
        collateralMint
      )
  );
  
  try {
    const signature = await sendAndConfirmTransaction(connection, tx, [creator], { skipPreflight: false });
    console.log("SUCCESS! Signature:", signature);
  } catch (e) {
    console.error("ERROR:", JSON.stringify(e));
  }
}
main().catch(console.error);
