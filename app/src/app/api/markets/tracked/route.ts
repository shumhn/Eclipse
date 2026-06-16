import { NextResponse } from 'next/server';
import { marketTracker } from '@/services/marketTracker';

export async function GET() {
  const stats = marketTracker.getStats();
  const markets = marketTracker.getAllMarkets();

  return NextResponse.json({
    success: true,
    data: {
      totalMarkets: stats.totalMarkets,
      activeMarkets: stats.activeMarkets,
      customOracleMarkets: stats.customOracleMarkets,
      recentMarkets: stats.recentMarkets.map((market) => ({
        publicKey: market.publicKey,
        question: market.question,
        creator: market.creator,
        createdAt: market.createdAt,
      })),
      markets,
    },
  });
}
