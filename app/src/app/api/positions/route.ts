import { NextResponse } from 'next/server';
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

    const position = await magicblockService.getTraderPositionInfo(market, walletAddress);

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
