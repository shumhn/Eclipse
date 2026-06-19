import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { coreService as magicblockService } from '@/services/magicblock-indexer';
import { marketTracker } from '@/services/marketTracker';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: marketId } = await context.params;
    const tracked = marketTracker.getMarket(marketId);
    const market = await magicblockService.getMarketInfo(marketId);

    if (!market && tracked) {
      const normalizedMarket = marketTracker.toNormalizedMarket(tracked);
      return NextResponse.json({
        success: true,
        data: {
          ...normalizedMarket,
          isV3: false,
          tradingEnabled: false,
        },
        isTracked: true,
      });
    }

    if (!market) {
      return NextResponse.json(
        { success: false, error: 'Market not found' },
        { status: 404 }
      );
    }

    const tradingEnabled =
      market.delegated && !market.account.resolved && !market.account.resolvable;
    const mergedMarket = tracked
      ? marketTracker.mergeWithCOREMarkets([market])[0]
      : market;

    return NextResponse.json({
      success: true,
      data: {
        ...mergedMarket,
        isV3: mergedMarket.delegated,
        tradingEnabled,
      },
      isTracked: Boolean(tracked),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
