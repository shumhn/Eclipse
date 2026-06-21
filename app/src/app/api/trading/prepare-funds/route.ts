import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

const prepareFundsSchema = z.object({
  market: z.string(),
  walletAddress: z.string(),
  topupReceiptAddress: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { market, walletAddress, topupReceiptAddress } = prepareFundsSchema.parse(body);

    const authHeader = req.headers.get('authorization') || '';
    const teeToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

    const result = await magicblockService.preparePrivateFundingTransaction({
      market,
      walletAddress,
      teeToken,
      topupReceiptAddress,
    });

    return NextResponse.json({
      success: true,
      data: {
        transaction: result.transaction
          ? result.transaction.serialize({ requireAllSignatures: false }).toString('base64')
          : null,
        positionAddress: result.positionAddress,
        alreadyFunded: result.alreadyFunded,
        sendTo: result.transaction ? 'ephemeral' : 'none',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
