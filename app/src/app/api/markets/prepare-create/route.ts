import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';
import {
  DEFAULT_PRICE_FEED_SYMBOL,
  isSupportedPriceFeedSymbol,
  type PriceFeedSymbol,
} from '@/lib/priceFeeds';

const priceFeedSymbolSchema = z.custom<PriceFeedSymbol>(
  (value) => typeof value === 'string' && isSupportedPriceFeedSymbol(value),
  'Unsupported price feed'
);

const prepareCreateMarketSchema = z.object({
  walletAddress: z.string(),
  question: z.string().min(10, 'Question must be at least 10 characters'),
  initialLiquidity: z.number().min(1000000, 'Minimum 1 token (1000000 units)'),
  endTime: z.number().int().positive(),
  oracleKind: z.enum(['manual', 'pythPrice']).optional().default('pythPrice'),
  oracleAsset: priceFeedSymbolSchema.optional().default(DEFAULT_PRICE_FEED_SYMBOL),
  targetPrice: z.string().optional().default('0'),
  priceDirection: z.enum(['above', 'below']).optional().default('above'),
  oracleFeed: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      walletAddress,
      question,
      initialLiquidity,
      endTime,
      oracleKind,
      oracleAsset,
      targetPrice,
      priceDirection,
      oracleFeed,
    } = prepareCreateMarketSchema.parse(body);

    const nowSec = Math.floor(Date.now() / 1000);
    if (endTime <= nowSec) {
      return NextResponse.json(
        { success: false, error: 'Resolution date must be in the future' },
        { status: 400 }
      );
    }

    const result = await magicblockService.prepareCreateMarketTransaction({
      walletAddress,
      question,
      endTime,
      initialLiquidity: BigInt(initialLiquidity),
      oracleKind,
      oracleAsset,
      targetPrice: BigInt(targetPrice),
      priceDirection,
      oracleFeed,
    });

    return NextResponse.json({
      success: true,
      data: {
        transaction: result.transaction.serialize({ requireAllSignatures: false }).toString('base64'),
        sendTo: 'base',
        marketAddress: result.marketAddress,
        creatorPosition: result.creatorPosition,
        creatorPrivatePosition: result.creatorPrivatePosition,
        vault: result.vault,
        collateralMint: result.collateralMint,
        marketId: result.marketId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
