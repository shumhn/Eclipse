import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';

const PROGRAM_ID = new PublicKey('ACPDQsNr539BaFTc1hRtryj66N7UH2GGdKPx6wyiYSYx');
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
console.log("Config PDA:", configPda.toBase58());
