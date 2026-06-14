import { PublicKey } from '@solana/web3.js';
const PROGRAM_ID = new PublicKey('ACPDQsNr539BaFTc1hRtryj66N7UH2GGdKPx6wyiYSYx');
const idBuf = Buffer.alloc(8);
idBuf.writeBigUInt64LE(BigInt(0));
const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from('market'), idBuf], PROGRAM_ID);
console.log("Market 0 PDA:", marketPda.toBase58());
