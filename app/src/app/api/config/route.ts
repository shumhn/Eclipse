import { NextResponse } from 'next/server';
import { coreService as magicblockService } from '@/services/magicblock-indexer';

export async function GET() {
  try {
    const config = await magicblockService.getProtocolConfig();

    return NextResponse.json({
      success: true,
      data: {
        collateralMint: config.collateralMint,
        teeValidator: config.teeValidator,
        marketCount: config.marketCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
