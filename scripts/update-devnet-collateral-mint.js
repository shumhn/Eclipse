const anchor = require('@coral-xyz/anchor');
const NodeWallet = require('@coral-xyz/anchor/dist/cjs/nodewallet').default;
const { Keypair, PublicKey, Connection } = require('@solana/web3.js');
const fs = require('fs');

const PROGRAM_ID = new PublicKey('79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t');
const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const keypairPath = '/Users/sumangiri/Desktop/Homie/keys/payroll-authority.json';

async function main() {
  const admin = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
  );
  const idl = JSON.parse(
    fs.readFileSync('/Users/sumangiri/Desktop/private-markets-solana/target/idl/prediction_market.json', 'utf8')
  );
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const provider = new anchor.AnchorProvider(connection, new NodeWallet(admin), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  const program = new anchor.Program(idl, provider);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);

  const signature = await program.methods
    .updateCollateralMint()
    .accounts({
      admin: admin.publicKey,
      config: configPda,
      collateralMint: DEVNET_USDC_MINT,
    })
    .signers([admin])
    .rpc();

  const config = await program.account.config.fetch(configPda);
  console.log(
    JSON.stringify(
      {
        signature,
        config: configPda.toBase58(),
        collateralMint: config.collateralMint.toBase58(),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
