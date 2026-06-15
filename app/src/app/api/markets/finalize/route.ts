import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';
import { marketTracker } from '@/services/marketTracker';

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
  oracleAsset: z.enum(['SOLUSD', 'BTCUSD']).optional().default('SOLUSD'),
  targetPrice: z.string().optional().default('0'),
  priceDirection: z.enum(['above', 'below']).optional().default('above'),
  oracleFeed: z.string().optional(),
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
