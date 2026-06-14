import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

const prepareClaimSchema = z.object({
  market: z.string(),
  walletAddress: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { market, walletAddress } = prepareClaimSchema.parse(body);

    const result = await magicblockService.prepareClaimTransaction({ market, walletAddress });

    return NextResponse.json({
      success: true,
      data: {
        transaction: result.transaction.serialize({ requireAllSignatures: false }).toString('base64'),
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
