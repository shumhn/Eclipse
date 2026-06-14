import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

const preparePositionSchema = z.object({
  market: z.string(),
  amountUsdc: z.number(),
  walletAddress: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { market, amountUsdc, walletAddress } = preparePositionSchema.parse(body);

    const result = await magicblockService.preparePositionSetupTransaction({
      market,
      amountUsdc,
      walletAddress,
    });

    return NextResponse.json({
      success: true,
      data: {
        transaction: result.transaction.serialize({ requireAllSignatures: false }).toString('base64'),
        positionAddress: result.positionAddress,
        alreadyExists: result.alreadyExists,
        sendTo: 'base',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
