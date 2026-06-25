const { Transaction } = require('@solana/web3.js');
const tx = new Transaction();
try {
  tx.add(undefined);
  console.log("Ignored undefined!");
  console.log(tx.instructions.length);
} catch (e) {
  console.log("Threw error!");
}
