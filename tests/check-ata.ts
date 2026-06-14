import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

const wallet = new PublicKey('6BVNKKuaHYYCmykxMD2sRFFFDaiD7Ah9KdcSmFgk1tSK');
const mint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

(async () => {
  const ata = await getAssociatedTokenAddress(mint, wallet);
  console.log('Computed ATA:', ata.toBase58());
  console.log('Expected ATA: 7AzWAXJomqK6fU8LcZ2s1PJjfyzKArGiHVSrPREvCWfU');
  console.log('Match:', ata.toBase58() === '7AzWAXJomqK6fU8LcZ2s1PJjfyzKArGiHVSrPREvCWfU');
})();
