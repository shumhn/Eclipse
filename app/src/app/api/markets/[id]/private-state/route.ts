import { NextResponse } from 'next/server';
import { MagicBlockIndexer } from '@/services/magicblock-indexer';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Empty token' }, { status: 401 });
    }

    const marketId = resolvedParams.id;
    if (!marketId) {
      return NextResponse.json({ error: 'Market ID is required' }, { status: 400 });
    }

    const indexer = new MagicBlockIndexer();
    const privateState = await indexer.getDecryptedMarketState(marketId, token);

    if (!privateState) {
      return NextResponse.json({ error: 'Private state not found or invalid token' }, { status: 404 });
    }

    return NextResponse.json({ privateState });
  } catch (error: any) {
    console.error('Failed to fetch private state:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
