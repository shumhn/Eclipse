import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

const resolveMarketSchema = z.object({
  market: z.string(),
  outcome: z.enum(['yes', 'no']),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { market, outcome } = resolveMarketSchema.parse(body);

    const result = await magicblockService.resolveMarketAndCommit(market, outcome);

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
