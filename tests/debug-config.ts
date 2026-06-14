import { PublicKey, Connection } from '@solana/web3.js';
import pkg from '@coral-xyz/anchor';
const { AnchorProvider, Program, setProvider, workspace, Wallet } = pkg;

const provider = AnchorProvider.env();
setProvider(provider);

const program = workspace.PredictionMarket as any;
const PROGRAM_ID = new PublicKey('79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t');
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);

(async () => {
  const configData = await program.account.config.fetch(configPda);
  console.log('Config collateral_mint:', configData.collateralMint.toBase58());
  console.log('Expected:              4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  console.log('Match:', configData.collateralMint.toBase58() === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  console.log('Admin:', configData.admin.toBase58());
  console.log('Market count:', configData.marketCount.toString());
})();
