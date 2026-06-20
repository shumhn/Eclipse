/**
 * API client for Private Prediction Markets (MagicBlock TEE)
 */
import type { PriceFeedAsset, PriceFeedSymbol } from './priceFeeds';
import type { SportsMarketMetadata } from './sports';

// Use relative URLs - Next.js rewrites will proxy to the actual API
const API_BASE = '';

// Token mint addresses (Devnet)
// USDC Devnet - collateral for all markets
export const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export interface MarketProof {
  createdAt?: number;
  updatedAt?: number;
  createSignature?: string;
  marketDelegationSignature?: string | null;
  creatorPositionDelegationSignature?: string | null;
  privateStateInitializationSignature?: string | null;
  resolveSignature?: string | null;
  commitSignature?: string | null;
  creatorPosition?: string;
}

export interface Market {
  publicKey: string;
  delegated?: boolean;
  ownerProgram?: string;
  privacyMode?: 'shielded' | 'transparent';
  positionsHidden?: boolean;
  settlementState?: 'delegated' | 'base';
  tracked?: boolean;
  proof?: MarketProof;
  priceMarket?: {
    asset: PriceFeedAsset | 'Unknown';
    targetPriceUsd: number | null;
    currentPriceUsd: number | null;
    resolverPriceUsd: number | null;
    direction: 'above' | 'below';
    rule: string;
    oracleFeed?: string;
  };
  sportsMarket?: SportsMarketMetadata;
  account: {
    id: string;
    question: string;
    resolved: boolean;
    resolvable: boolean;
    creator: string;
    end_time: string;
    creation_time: string;
    initial_liquidity: string;
    yes_token_mint: string;
    no_token_mint: string;
    yes_token_supply_minted: string;
    no_token_supply_minted: string;
    collateral_token: string;
    market_reserves: string;
    winning_token_id: { None: Record<string, never> } | { Some: string };
    oracle_kind?: 'manual' | 'pythPrice';
    price_direction?: 'above' | 'below';
    target_price?: string;
    oracle_feed?: string;
    resolver_price?: string;
  };
  isV3?: boolean;           // V3 markets have proper token mints initialized
  tradingEnabled?: boolean; // True for V3 markets
  privacyNote?: string;
}

export interface MarketPrices {
  yes: number;
  no: number;
}

export interface Position {
  publicKey: string;
  delegated: boolean;
  market: string;
  trader: string;
  collateralDeposited: string;
  collateralWithdrawn: string;
  collateralAvailable: string;
  yesShares: string;
  noShares: string;
  claimableAmount: string;
  claimedAmount: string;
  settled: boolean;
  claimed: boolean;
  bump: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function parseApiResponse<T>(
  res: Response,
  fallbackMessage: string
): Promise<ApiResponse<T>> {
  const text = await res.text();

  let json: ApiResponse<T>;
  try {
    json = JSON.parse(text) as ApiResponse<T>;
  } catch {
    if (!res.ok) {
      throw new Error(
        `Backend request failed (${res.status}).`
      );
    }

    throw new Error(fallbackMessage);
  }

  if (!res.ok || !json.success) {
    throw new Error(
      json.error ||
        `Backend request failed (${res.status}).`
    );
  }

  return json;
}

// Markets API
export async function fetchMarkets(): Promise<Market[]> {
  const res = await fetch(`${API_BASE}/api/markets`);
  const json = await parseApiResponse<{ count: number; data: Market[] }>(
    res,
    'Failed to fetch markets'
  );
  return json.data?.data || [];
}

export async function trackNewMarket(marketAddress: string): Promise<void> {
  const res = await fetch(`/api/markets/${marketAddress}/track`, {
    method: 'POST',
  });
  if (!res.ok) {
    console.error('Failed to start tracking market:', await res.text());
  }
}

export async function fetchDecryptedMarketState(marketAddress: string, teeToken: string) {
  const res = await fetch(`/api/markets/${marketAddress}/private-state`, {
    headers: {
      Authorization: `Bearer ${teeToken}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Failed to fetch decrypted private state:', text);
    throw new Error(`Failed to fetch decrypted private state: ${text}`);
  }
  const data = await res.json();
  return data.privateState;
}

export async function fetchMarket(marketId: string): Promise<Market | null> {
  const res = await fetch(`${API_BASE}/api/markets/${marketId}`);
  const json = await parseApiResponse<Market>(res, 'Failed to fetch market');
  return json.data || null;
}

export async function fetchMarketPrices(marketId: string): Promise<MarketPrices> {
  const res = await fetch(`${API_BASE}/api/trading/market/${marketId}/info`);
  const json = await parseApiResponse<{ market: Market; prices: MarketPrices }>(
    res,
    'Failed to fetch prices'
  );
  return json.data?.prices || { yes: 0.5, no: 0.5 };
}

export async function fetchPosition(params: {
  marketAddress: string;
  walletAddress: string;
  teeToken?: string;
}): Promise<Position | null> {
  const searchParams = new URLSearchParams({
    market: params.marketAddress,
    walletAddress: params.walletAddress,
  });
  const res = await fetch(`${API_BASE}/api/positions?${searchParams.toString()}`, {
    headers: params.teeToken
      ? { Authorization: `Bearer ${params.teeToken}` }
      : undefined,
  });
  const json = await parseApiResponse<Position | null>(res, 'Failed to fetch position');
  return json.data || null;
}

// Trading API
export interface TradeResult {
  signature: string | null;
  market: string;
  side: 'yes' | 'no';
  amount: string;
  executedAt: string;
}

export async function executeTrade(params: {
  market: string;
  side: 'yes' | 'no';
  amount: string;
}): Promise<TradeResult> {
  const res = await fetch(`${API_BASE}/api/trading/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await parseApiResponse<TradeResult>(res, 'Failed to execute trade');
  return json.data!;
}

// Market Creation API
export interface CreateMarketParams {
  question: string;
  initialLiquidity: number;
  endTime: number;
  endTimeHours?: number;
  collateralMint?: string;
  useCustomOracle?: boolean;
  oracleKind?: 'manual' | 'pythPrice';
  oracleAsset?: PriceFeedSymbol;
  targetPrice?: string;
  priceDirection?: 'above' | 'below';
  oracleFeed?: string;
  sportsMarket?: SportsMarketMetadata;
}

export interface CreateMarketResult {
  marketAddress: string;
  signature: string;
  question: string;
  creator: string;
  endTime: string;
  isCustomOracle: boolean;
  oracleKind?: 'manual' | 'pythPrice';
  oracleAsset?: PriceFeedSymbol;
  priceDirection?: 'above' | 'below';
  targetPrice?: string;
  oracleFeed?: string;
  delegated?: boolean;
  delegationSignature?: string | null;
  creatorPositionDelegationSignature?: string | null;
  privateStateInitializationSignature?: string | null;
  privateStateSnapshot?: Record<string, unknown> | null;
  creatorPosition?: string;
  sportsMarket?: SportsMarketMetadata;
  tracked: {
    publicKey: string;
    question: string;
    creator: string;
    createdAt: number;
    updatedAt: number;
    yesProbability: number;
    noProbability: number;
    collateralMint: string;
    initialLiquidity: string;
    endTime: number;
    transactionSignature: string;
    isCustomOracle: boolean;
    marketDelegationSignature?: string | null;
    creatorPositionDelegationSignature?: string | null;
    privateStateInitializationSignature?: string | null;
    resolveSignature?: string | null;
    commitSignature?: string | null;
    creatorPosition?: string;
    sportsMarket?: SportsMarketMetadata;
  };
}

export interface PreparedCreateMarket {
  transaction: string;
  sendTo: 'base';
  marketAddress: string;
  creatorPosition: string;
  creatorPrivatePosition: string;
  vault: string;
  collateralMint: string;
  marketId: number;
}

export async function createMarket(params: CreateMarketParams): Promise<CreateMarketResult> {
  const res = await fetch(`${API_BASE}/api/markets/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await parseApiResponse<CreateMarketResult>(res, 'Failed to create market');
  return json.data!;
}

export async function prepareCreateMarket(
  params: CreateMarketParams & { walletAddress: string }
): Promise<PreparedCreateMarket> {
  const res = await fetch(`${API_BASE}/api/markets/prepare-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await parseApiResponse<PreparedCreateMarket>(res, 'Failed to prepare market creation');
  return json.data!;
}

export async function finalizeCreateMarket(
  params: CreateMarketParams & {
    walletAddress: string;
    marketAddress: string;
    createSignature: string;
  }
): Promise<CreateMarketResult> {
  const res = await fetch(`${API_BASE}/api/markets/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await parseApiResponse<CreateMarketResult>(res, 'Failed to finalize market creation');
  return json.data!;
}

export interface LivePriceFeed {
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
  currentPriceUsd: number | null;
  publishTime: number | null;
}

export async function fetchLivePriceFeeds(): Promise<LivePriceFeed[]> {
  const res = await fetch(`${API_BASE}/api/oracles/price-feeds`, {
    cache: 'no-store',
  });
  const json = await parseApiResponse<LivePriceFeed[]>(
    res,
    'Failed to fetch live price feeds'
  );
  return json.data || [];
}

// Tracked Markets API
export interface TrackedMarketsResponse {
  totalMarkets: number;
  activeMarkets: number;
  customOracleMarkets: number;
  recentMarkets: Array<{
    publicKey: string;
    question: string;
    creator: string;
    createdAt: number;
  }>;
  markets: Array<{
    publicKey: string;
    question: string;
    creator: string;
    createdAt: number;
    updatedAt: number;
    yesProbability: number;
    noProbability: number;
    collateralMint: string;
    initialLiquidity: string;
    endTime: number;
    transactionSignature: string;
    isCustomOracle: boolean;
    marketDelegationSignature?: string | null;
    creatorPositionDelegationSignature?: string | null;
    privateStateInitializationSignature?: string | null;
    resolveSignature?: string | null;
    commitSignature?: string | null;
    creatorPosition?: string;
    sportsMarket?: SportsMarketMetadata;
  }>;
}

export function explorerAccountUrl(address: string): string {
  return `https://solscan.io/account/${address}?cluster=devnet`;
}

export function explorerTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

export async function fetchTrackedMarkets(): Promise<TrackedMarketsResponse> {
  const res = await fetch(`${API_BASE}/api/markets/tracked`);
  const json = await parseApiResponse<TrackedMarketsResponse>(
    res,
    'Failed to fetch tracked markets'
  );
  return json.data!;
}

// Utility functions
export function calculatePriceFromReserves(
  yesSupply: string,
  noSupply: string
): MarketPrices {
  const yes = parseInt(yesSupply, 16) || 1;
  const no = parseInt(noSupply, 16) || 1;
  const total = yes + no;
  return {
    yes: Math.round((no / total) * 100) / 100,
    no: Math.round((yes / total) * 100) / 100,
  };
}

export function formatTimestamp(hexTimestamp: string): Date {
  const seconds = parseInt(hexTimestamp, 16);
  return new Date(seconds * 1000);
}

export function isMarketActive(market: Market): boolean {
  const endTime = formatTimestamp(market.account.end_time);
  return !market.account.resolved && endTime > new Date();
}

export function getMarketTimeRemaining(market: Market): string {
  const endTime = formatTimestamp(market.account.end_time);
  const now = new Date();
  const diff = endTime.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return 'Ending soon';
}

export function formatUsdPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 0 : 2 })}`;
}
