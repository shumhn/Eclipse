import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

const crankSchema = z.object({
  limit: z.number().int().positive().max(50).optional(),
});

export async function POST(req: Request) {
  try {
    const configuredSecret = process.env.CRANK_SECRET;
    if (configuredSecret) {
      const providedSecret = req.headers.get('x-crank-secret');
      if (providedSecret !== configuredSecret) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized crank request' },
          { status: 401 }
        );
      }
    }

    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const { limit } = crankSchema.parse(body);

    const result = await magicblockService.autoResolveExpiredPriceMarkets({ limit });

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
