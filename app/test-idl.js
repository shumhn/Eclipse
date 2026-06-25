const idl = require('../target/idl/prediction_market.json');
const ix = idl.instructions.find(i => i.name === 'create_price_market');
if (!ix) {
  console.log('create_price_market not found');
  process.exit(1);
}
console.log(ix.accounts.map(a => `${a.name}: ${a.writable}`).join(', '));
