import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const market = searchParams.get('market');
    const walletAddress = searchParams.get('walletAddress');

    if (!market || !walletAddress) {
      return NextResponse.json(
        { success: false, error: 'market and walletAddress query params are required' },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    const teeToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

    const position = await magicblockService.getTraderPositionInfo(market, walletAddress, teeToken);

    return NextResponse.json({
      success: true,
      data: position,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
