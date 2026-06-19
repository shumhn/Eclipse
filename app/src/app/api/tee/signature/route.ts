import { NextResponse } from 'next/server';

const TEE_RPC_URL = 'https://devnet-tee.magicblock.app';

type MagicBlockSignatureStatus = {
  slot: number;
  confirmations: number | null;
  status: { Ok: null } | { Err: unknown } | null;
  err: unknown | null;
  confirmationStatus: 'processed' | 'confirmed' | 'finalized' | null;
};

function formatRpcError(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(TEE_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`MagicBlock TEE RPC failed (${response.status})`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || 'MagicBlock TEE RPC returned an error');
  }

  return json.result as T;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const signature = searchParams.get('signature');

    if (!signature) {
      return NextResponse.json(
        { success: false, error: 'signature query param is required' },
        { status: 400 }
      );
    }

    const statusResult = await rpc<{
      context: { slot: number };
      value: Array<MagicBlockSignatureStatus | null>;
    }>('getSignatureStatuses', [
      [signature],
      { searchTransactionHistory: true },
    ]);

    const status = statusResult.value[0];

    return NextResponse.json({
      success: true,
      data: {
        signature,
        rpc: TEE_RPC_URL,
        found: Boolean(status),
        slot: status?.slot ?? null,
        err: status?.err ?? null,
        errorMessage: formatRpcError(status?.err ?? null),
        confirmationStatus: status?.confirmationStatus ?? null,
        finalized: status?.confirmationStatus === 'finalized' && status.err === null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
