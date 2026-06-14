import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';
import { marketTracker } from '@/services/marketTracker';

export async function GET() {
  try {
    const coreMarkets = await magicblockService.getAllMarkets();
    const mergedMarkets = marketTracker.mergeWithCOREMarkets(coreMarkets.data);

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

const createMarketSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters'),
  initialLiquidity: z.number().min(1000000, 'Minimum 1 token (1000000 units)'),
  endTimeHours: z.number().min(1).max(8760),
  collateralMint: z.string().optional(),
  useCustomOracle: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { question, initialLiquidity, endTimeHours, collateralMint, useCustomOracle } = createMarketSchema.parse(body);

    const endTime = Math.floor(Date.now() / 1000) + endTimeHours * 60 * 60;
    const result = await magicblockService.createPrivacyMarket({
      question,
      endTime,
      initialLiquidity: BigInt(initialLiquidity),
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
        delegated: result.delegated,
        delegationSignature: result.delegationSignature,
        creatorPositionDelegationSignature: result.creatorPositionDelegationSignature,
        privateStateInitializationSignature: result.privateStateInitializationSignature,
        creatorPosition: result.creatorPosition,
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
