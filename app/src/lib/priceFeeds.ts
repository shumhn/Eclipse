export type PriceFeedSymbol = 'BTCUSD' | 'ETHUSD' | 'SOLUSD' | 'JUPUSD';
export type PriceFeedAsset = 'BTC' | 'ETH' | 'SOL' | 'JUP';

export interface SupportedPriceFeed {
  symbol: PriceFeedSymbol;
  asset: PriceFeedAsset;
  label: string;
  baseAsset: string;
  quoteAsset: 'USD';
  magicBlockFeed: string;
  pythLazerId: number;
  exponent: number;
  hermesFeedId: string;
  tradingViewSymbol: string;
}

export const SUPPORTED_PRICE_FEEDS: readonly SupportedPriceFeed[] = [
  {
    symbol: 'BTCUSD',
    asset: 'BTC',
    label: 'BTC',
    baseAsset: 'BTC',
    quoteAsset: 'USD',
    magicBlockFeed: '71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr',
    pythLazerId: 1,
    exponent: -8,
    hermesFeedId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    tradingViewSymbol: 'Crypto.BTC/USD',
  },
  {
    symbol: 'ETHUSD',
    asset: 'ETH',
    label: 'ETH',
    baseAsset: 'ETH',
    quoteAsset: 'USD',
    magicBlockFeed: '5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG',
    pythLazerId: 2,
    exponent: -8,
    hermesFeedId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    tradingViewSymbol: 'Crypto.ETH/USD',
  },
  {
    symbol: 'SOLUSD',
    asset: 'SOL',
    label: 'SOL',
    baseAsset: 'SOL',
    quoteAsset: 'USD',
    magicBlockFeed: 'ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu',
    pythLazerId: 6,
    exponent: -8,
    hermesFeedId: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    tradingViewSymbol: 'Crypto.SOL/USD',
  },
  {
    symbol: 'JUPUSD',
    asset: 'JUP',
    label: 'JUP',
    baseAsset: 'JUP',
    quoteAsset: 'USD',
    magicBlockFeed: 'G2kZYbT2e2qig54RH8FY6G5ihq1QsxTZsNVuAZMV7AW2',
    pythLazerId: 92,
    exponent: -8,
    hermesFeedId: '0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
    tradingViewSymbol: 'Crypto.JUP/USD',
  },
] as const;

export const DEFAULT_PRICE_FEED_SYMBOL: PriceFeedSymbol = 'BTCUSD';

export const PRICE_FEED_BY_SYMBOL = Object.fromEntries(
  SUPPORTED_PRICE_FEEDS.map((feed) => [feed.symbol, feed])
) as Record<PriceFeedSymbol, SupportedPriceFeed>;

export const PRICE_FEED_BY_ASSET = Object.fromEntries(
  SUPPORTED_PRICE_FEEDS.map((feed) => [feed.asset, feed])
) as Record<PriceFeedAsset, SupportedPriceFeed>;

export const PRICE_FEED_BY_MAGICBLOCK_ACCOUNT = Object.fromEntries(
  SUPPORTED_PRICE_FEEDS.map((feed) => [feed.magicBlockFeed, feed])
) as Record<string, SupportedPriceFeed>;

export const PRICE_FEED_SYMBOLS = SUPPORTED_PRICE_FEEDS.map((feed) => feed.symbol) as [
  PriceFeedSymbol,
  ...PriceFeedSymbol[],
];

export function isSupportedPriceFeedSymbol(value: string): value is PriceFeedSymbol {
  return value in PRICE_FEED_BY_SYMBOL;
}

export function formatUsdPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  })}`;
}
