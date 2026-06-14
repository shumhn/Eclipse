import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

const prepareTradeSchema = z.object({
  market: z.string(),
  side: z.enum(['yes', 'no']),
  amountUsdc: z.number().positive(),
  walletAddress: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { market, side, amountUsdc, walletAddress } = prepareTradeSchema.parse(body);

    const result = await magicblockService.preparePrivateTradeTransaction({
      market,
      side,
      amountUsdc,
      walletAddress,
    });

    return NextResponse.json({
      success: true,
      data: {
        transaction: result.transaction.serialize({ requireAllSignatures: false }).toString('base64'),
        positionAddress: result.positionAddress,
        sendTo: 'ephemeral',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
