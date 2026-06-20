import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';
import { marketTracker } from '@/services/marketTracker';
import {
  DEFAULT_PRICE_FEED_SYMBOL,
  isSupportedPriceFeedSymbol,
  type PriceFeedSymbol,
} from '@/lib/priceFeeds';

const priceFeedSymbolSchema = z.custom<PriceFeedSymbol>(
  (value) => typeof value === 'string' && isSupportedPriceFeedSymbol(value),
  'Unsupported price feed'
);

const sportsMarketSchema = z.object({
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
}).optional();

const finalizeMarketSchema = z.object({
  marketAddress: z.string(),
  walletAddress: z.string(),
  createSignature: z.string(),
  question: z.string().min(10),
  initialLiquidity: z.number().min(1000000),
  endTime: z.number().int().positive(),
  collateralMint: z.string().optional(),
  useCustomOracle: z.boolean().optional().default(false),
  oracleKind: z.enum(['manual', 'pythPrice']).optional().default('pythPrice'),
  oracleAsset: priceFeedSymbolSchema.optional().default(DEFAULT_PRICE_FEED_SYMBOL),
  targetPrice: z.string().optional().default('0'),
  priceDirection: z.enum(['above', 'below']).optional().default('above'),
  oracleFeed: z.string().optional(),
  sportsMarket: sportsMarketSchema,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      marketAddress,
      walletAddress,
      createSignature,
      question,
      initialLiquidity,
      endTime,
      collateralMint,
      useCustomOracle,
      oracleKind,
      oracleAsset,
      targetPrice,
      priceDirection,
      oracleFeed,
      sportsMarket,
    } = finalizeMarketSchema.parse(body);

    const result = await magicblockService.finalizeMarketCreation({
      marketAddress,
      walletAddress,
    });

    const trackedMarket = marketTracker.trackMarket({
      publicKey: marketAddress,
      question,
      creator: walletAddress,
      collateralMint: collateralMint || '',
      initialLiquidity: initialLiquidity.toString(),
      endTime,
      transactionSignature: createSignature,
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
        marketAddress,
        signature: createSignature,
        question,
        creator: walletAddress,
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
