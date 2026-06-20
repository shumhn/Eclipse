import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';
import { marketTracker } from '@/services/marketTracker';
import {
  DEFAULT_PRICE_FEED_SYMBOL,
  isSupportedPriceFeedSymbol,
  type PriceFeedSymbol,
} from '@/lib/priceFeeds';

export async function GET() {
  try {
    const config = await magicblockService.getProtocolConfig();
    const coreMarkets = await magicblockService.getAllMarkets();
    const supportedMarkets = coreMarkets.data.filter(
      (market) => market.account.collateral_token === config.collateralMint
    );
    let mergedMarkets = marketTracker.mergeWithCOREMarkets(supportedMarkets);

    // Filter out test markets from the UI
    mergedMarkets = mergedMarkets.filter(
      (market) => !market.question?.toLowerCase().startsWith('test market')
    );

    return NextResponse.json({
      success: true,
      data: {
        count: mergedMarkets.length,
        trackedCount: marketTracker.getStats().totalMarkets,
        data: mergedMarkets,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

const priceFeedSymbolSchema = z.custom<PriceFeedSymbol>(
  (value) => typeof value === 'string' && isSupportedPriceFeedSymbol(value),
  'Unsupported price feed'
);

const createMarketSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters'),
  initialLiquidity: z.number().min(1000000, 'Minimum 1 token (1000000 units)'),
  endTime: z.number().int().positive().optional(),
  endTimeHours: z.number().min(1).max(8760).optional(),
  collateralMint: z.string().optional(),
  useCustomOracle: z.boolean().optional().default(false),
  oracleKind: z.enum(['manual', 'pythPrice']).optional().default('pythPrice'),
  oracleAsset: priceFeedSymbolSchema.optional().default(DEFAULT_PRICE_FEED_SYMBOL),
  targetPrice: z.string().optional().default('0'),
  priceDirection: z.enum(['above', 'below']).optional().default('above'),
  oracleFeed: z.string().optional(),
  sportsMarket: z.object({
    category: z.literal('world-cup'),
    competition: z.string(),
    eventId: z.string(),
    eventSlug: z.string(),
    homeTeam: z.string(),
    awayTeam: z.string(),
    startTime: z.string(),
    marketType: z.enum(['match_winner', 'over_under', 'both_teams_score', 'qualify', 'custom']),
    resolutionRule: z.string(),
    source: z.enum(['espn', 'polymarket', 'manual']),
  }).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      question,
      initialLiquidity,
      endTime: requestedEndTime,
      endTimeHours,
      collateralMint,
      useCustomOracle,
      oracleKind,
      oracleAsset,
      targetPrice,
      priceDirection,
      oracleFeed,
      sportsMarket,
    } = createMarketSchema.parse(body);

    const nowSec = Math.floor(Date.now() / 1000);
    const endTime = requestedEndTime ?? nowSec + (endTimeHours ?? 1) * 60 * 60;
    if (endTime <= nowSec) {
      return NextResponse.json(
        { success: false, error: 'Resolution date must be in the future' },
        { status: 400 }
      );
    }

    const result = await magicblockService.createPrivacyMarket({
      question,
      endTime,
      initialLiquidity: BigInt(initialLiquidity),
      oracleKind,
      oracleAsset,
      targetPrice: BigInt(targetPrice),
      priceDirection,
      oracleFeed,
    });

    const trackedMarket = marketTracker.trackMarket({
      publicKey: result.marketAddress,
      question,
      creator: result.creator,
      collateralMint: collateralMint || '',
      initialLiquidity: initialLiquidity.toString(),
      endTime,
      transactionSignature: result.signature,
      isCustomOracle: useCustomOracle,
      creatorPosition: result.creatorPosition,
      marketDelegationSignature: result.delegationSignature,
      creatorPositionDelegationSignature: result.creatorPositionDelegationSignature,
      privateStateInitializationSignature: result.privateStateInitializationSignature,
      sportsMarket,
    });

    return NextResponse.json({
      success: true,
      data: {
        marketAddress: result.marketAddress,
        signature: result.signature,
        question,
        creator: result.creator,
        endTime: new Date(endTime * 1000).toISOString(),
        isCustomOracle: useCustomOracle,
        oracleKind,
        oracleAsset,
        priceDirection,
        targetPrice,
        oracleFeed,
        delegated: result.delegated,
        delegationSignature: result.delegationSignature,
        creatorPositionDelegationSignature: result.creatorPositionDelegationSignature,
        privateStateInitializationSignature: result.privateStateInitializationSignature,
        privateStateSnapshot: result.privateStateSnapshot,
        creatorPosition: result.creatorPosition,
        sportsMarket,
        tracked: { ...trackedMarket },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
