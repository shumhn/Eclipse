import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

const prepareSellSchema = z.object({
  market: z.string(),
  side: z.enum(['yes', 'no']),
  shares: z.number().positive(),
  walletAddress: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { market, side, shares, walletAddress } = prepareSellSchema.parse(body);

    const authHeader = req.headers.get('authorization') || '';
    const teeToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

    const result = await magicblockService.preparePrivateSellTransaction({
      market,
      side,
      shares,
      walletAddress,
      teeToken,
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
