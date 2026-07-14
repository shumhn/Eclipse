import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

const withdrawFeesSchema = z.object({
  market: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { market } = withdrawFeesSchema.parse(body);

    const result = await magicblockService.withdrawProtocolFees(market);

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
