import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

const delegateTopupSchema = z.object({
  market: z.string(),
  walletAddress: z.string(),
  nonce: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { market, walletAddress, nonce } = delegateTopupSchema.parse(body);

    const result = await magicblockService.delegateTopupReceipt(market, walletAddress, nonce);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
