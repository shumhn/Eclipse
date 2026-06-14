/**
 * API client for Private Prediction Markets (MagicBlock TEE)
 */

// Use relative URLs - Next.js rewrites will proxy to the actual API
const API_BASE = '';

// Token mint addresses (Devnet)
// USDC Devnet - collateral for all markets
export const USDC_MINT = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

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
  };
  isV3?: boolean;           // V3 markets have proper token mints initialized
  tradingEnabled?: boolean; // True for V3 markets
  privacyNote?: string;
}

export interface MarketPrices {
  yes: number;
  no: number;
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
  endTimeHours: number;
  collateralMint?: string;
  useCustomOracle?: boolean;
}

export interface CreateMarketResult {
  marketAddress: string;
  signature: string;
  question: string;
  creator: string;
  endTime: string;
  isCustomOracle: boolean;
  delegated?: boolean;
  delegationSignature?: string | null;
  creatorPositionDelegationSignature?: string | null;
  privateStateInitializationSignature?: string | null;
  creatorPosition?: string;
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
  };
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
  }>;
}

export function explorerAccountUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
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
