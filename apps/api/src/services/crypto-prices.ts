/**
 * Crypto Price Service
 * Fetches real-time crypto prices from free APIs
 */

interface CoinGeckoPrice {
  [coin: string]: {
    usd: number;
    usd_24h_change: number;
  };
}

interface PriceData {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  timestamp: number;
}

const TRACKED_COINS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
];

class CryptoPriceService {
  private cache: Map<string, PriceData> = new Map();
  private lastFetch: number = 0;
  private cacheDuration = 60 * 1000; // 1 minute cache

  /**
   * Fetch current prices from CoinGecko (free, no API key needed)
   */
  async fetchPrices(): Promise<PriceData[]> {
    // Check cache
    if (Date.now() - this.lastFetch < this.cacheDuration && this.cache.size > 0) {
      return Array.from(this.cache.values());
    }

    try {
      const coinIds = TRACKED_COINS.map(c => c.id).join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true`;

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = (await response.json()) as CoinGeckoPrice;
      const prices: PriceData[] = [];

      for (const coin of TRACKED_COINS) {
        const coinData = data[coin.id];
        if (coinData) {
          const priceData: PriceData = {
            symbol: coin.symbol,
            name: coin.name,
            price: coinData.usd,
            change24h: coinData.usd_24h_change || 0,
            timestamp: Date.now(),
          };
          prices.push(priceData);
          this.cache.set(coin.symbol, priceData);
        }
      }

      this.lastFetch = Date.now();
      console.log(`📈 Fetched prices for ${prices.length} coins`);
      return prices;
    } catch (error) {
      console.error('Error fetching crypto prices:', (error as Error).message);
      // Return cached data if available
      if (this.cache.size > 0) {
        return Array.from(this.cache.values());
      }
      // Return demo data as fallback
      return this.getDemoPrices();
    }
  }

  /**
   * Get price for a specific coin
   */
  async getPrice(symbol: string): Promise<PriceData | null> {
    await this.fetchPrices();
    return this.cache.get(symbol.toUpperCase()) || null;
  }

  /**
   * Generate market ideas based on current prices
   */
  async generatePriceBasedMarkets(): Promise<Array<{
    question: string;
    category: string;
    reasoning: string;
  }>> {
    const prices = await this.fetchPrices();
    const markets: Array<{ question: string; category: string; reasoning: string }> = [];

    for (const price of prices) {
      // Generate round number targets
      const currentPrice = price.price;
      const roundTargets = this.getRoundTargets(currentPrice);

      for (const target of roundTargets) {
        const direction = target > currentPrice ? 'reach' : 'fall below';
        const timeframe = Math.abs(target - currentPrice) / currentPrice > 0.2 ? '6 months' : '3 months';

        markets.push({
          question: `Will ${price.name} (${price.symbol}) ${direction} $${target.toLocaleString()} within ${timeframe}?`,
          category: 'technology',
          reasoning: `Current price: $${currentPrice.toLocaleString()}, 24h change: ${price.change24h.toFixed(2)}%`,
        });
      }
    }

    return markets.slice(0, 10); // Return top 10
  }

  /**
   * Get round number price targets
   */
  private getRoundTargets(price: number): number[] {
    const targets: number[] = [];

    if (price > 50000) {
      // Bitcoin-like prices
      targets.push(
        Math.ceil(price / 10000) * 10000,
        Math.floor(price / 10000) * 10000,
        Math.ceil(price / 25000) * 25000
      );
    } else if (price > 1000) {
      // ETH-like prices
      targets.push(
        Math.ceil(price / 500) * 500,
        Math.floor(price / 500) * 500,
        Math.ceil(price / 1000) * 1000
      );
    } else if (price > 100) {
      // SOL-like prices
      targets.push(
        Math.ceil(price / 50) * 50,
        Math.floor(price / 50) * 50,
        Math.ceil(price / 100) * 100
      );
    } else {
      // Lower-priced coins
      targets.push(
        Math.ceil(price / 0.5) * 0.5,
        Math.floor(price / 0.5) * 0.5,
        Math.ceil(price)
      );
    }

    return [...new Set(targets)].filter(t => t !== price).slice(0, 2);
  }

  /**
   * Demo prices for offline/fallback
   */
  private getDemoPrices(): PriceData[] {
    return [
      { symbol: 'BTC', name: 'Bitcoin', price: 98500, change24h: 2.3, timestamp: Date.now() },
      { symbol: 'ETH', name: 'Ethereum', price: 3450, change24h: -1.2, timestamp: Date.now() },
      { symbol: 'SOL', name: 'Solana', price: 178, change24h: 5.7, timestamp: Date.now() },
      { symbol: 'XRP', name: 'XRP', price: 2.15, change24h: 0.8, timestamp: Date.now() },
      { symbol: 'ADA', name: 'Cardano', price: 0.95, change24h: -0.5, timestamp: Date.now() },
    ];
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      cachedCoins: this.cache.size,
      lastFetch: this.lastFetch ? new Date(this.lastFetch).toISOString() : null,
      cacheAge: this.lastFetch ? Math.floor((Date.now() - this.lastFetch) / 1000) + 's' : 'never',
    };
  }
}

export const cryptoPriceService = new CryptoPriceService();
