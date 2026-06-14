export interface MarketType {
  creator: Uint8Array;
  question: string;
  end_time: bigint;
  resolved: boolean;
  winning_token_id: string;
  resolvable: boolean;
  yes_token_mint: Uint8Array;
  no_token_mint: Uint8Array;
  collateral_token: Uint8Array;
}

export interface PrivateTrade {
  encryptedAmount: string;
  encryptedSide: string;
  marketAddress: string;
  timestamp: number;
}

export interface MarketOpportunity {
  question: string;
  reasoning: string;
  endTime: Date;
  confidence: number;
  category: 'price' | 'adoption' | 'regulation' | 'technology';
}

export interface NewsItem {
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface TradeStrategy {
  shouldTrade: boolean;
  side: 'yes' | 'no';
  amount: bigint;
}