import { NextResponse } from 'next/server';
import { z } from 'zod';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

const crankRunSchema = z.object({
  limit: z.number().int().positive().max(50).optional(),
});

function isAuthorized(req: Request): boolean {
  const configuredSecret = process.env.CRANK_SECRET || process.env.CRON_SECRET;
  if (!configuredSecret) return true;

  const headerSecret = req.headers.get('x-crank-secret');
  const authHeader = req.headers.get('authorization');
  const bearerSecret = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  return headerSecret === configuredSecret || bearerSecret === configuredSecret;
}

async function parseLimit(req: Request): Promise<number | undefined> {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    return crankRunSchema.parse({
      limit: limitParam ? Number(limitParam) : undefined,
    }).limit;
  }

  const bodyText = await req.text();
  const body = bodyText ? JSON.parse(bodyText) : {};
  return crankRunSchema.parse(body).limit;
}

async function runCrank(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized crank request' },
        { status: 401 }
      );
    }

    const limit = await parseLimit(req);
    const startedAt = new Date().toISOString();

    const resolve = await magicblockService.autoResolveExpiredPriceMarkets({ limit });
    const settle = await magicblockService.autoSettleResolvedPositions({ limit });

    return NextResponse.json({
      success: true,
      data: {
        startedAt,
        finishedAt: new Date().toISOString(),
        resolve,
        settle,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return runCrank(req);
}

export async function POST(req: Request) {
  return runCrank(req);
}
