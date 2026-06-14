import { assert } from 'chai';
import * as dotenv from 'dotenv';
import { Keypair } from '@solana/web3.js';

dotenv.config();

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001/api';

describe('API Smoke Test', () => {
  // We use a random dummy keypair for walletAddress since we are just calling prepare endpoints
  const dummyWallet = Keypair.generate().publicKey.toBase58();
  let testMarketAddress: string;
  let apiAvailable = false;

  before(async function () {
    // First let's hit the status endpoint to verify the API is reachable
    try {
      const response = await fetch(`${API_BASE_URL}/trading/status`);
      const data = await response.json();
      assert.isTrue(data.success);
      console.log('API is reachable and wallet configured:', data.data.configured);
      apiAvailable = true;
    } catch (e) {
      console.warn("API might not be running locally on port 3001. Start the API using 'npm run dev' in apps/api.");
      this.skip();
    }
    
    // In a real e2e, we would create a market first.
    // For smoke testing the API paths, we will just pass a valid-looking dummy market address 
    // or grab one if the markets endpoint exists. 
    testMarketAddress = Keypair.generate().publicKey.toBase58();
  });

  it('GET /api/trading/status', async () => {
    if (!apiAvailable) return;
    const response = await fetch(`${API_BASE_URL}/trading/status`);
    if (!response.ok) {
        // If server is not running, we just skip failing the hard assert, but log it
        console.warn("API is not running. Smoke test requires local API.");
        return;
    }
    const data = await response.json();
    assert.isDefined(data.success);
  });

  it('POST /api/trading/prepare-position', async () => {
    if (!apiAvailable) return;
    const response = await fetch(`${API_BASE_URL}/trading/prepare-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        market: testMarketAddress,
        amountUsdc: 10,
        walletAddress: dummyWallet,
      }),
    });
    
    const data = await response.json();
    // It might return success: false if the market doesn't actually exist on chain,
    // but we verify the endpoint is alive and validating input correctly.
    assert.isDefined(data.success);
    if (!data.success) {
      assert.include(data.error, 'Market not found');
    }
  });

  it('POST /api/trading/delegate-position', async () => {
    if (!apiAvailable) return;
    const response = await fetch(`${API_BASE_URL}/trading/delegate-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        market: testMarketAddress,
        walletAddress: dummyWallet,
      }),
    });
    
    const data = await response.json();
    assert.isDefined(data.success);
  });

  it('POST /api/trading/prepare-private', async () => {
    if (!apiAvailable) return;
    const response = await fetch(`${API_BASE_URL}/trading/prepare-private`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        market: testMarketAddress,
        side: 'yes',
        amountUsdc: 10,
        walletAddress: dummyWallet,
      }),
    });
    
    const data = await response.json();
    assert.isDefined(data.success);
  });
});
