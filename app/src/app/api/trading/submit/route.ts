import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Connection } from '@solana/web3.js';

const submitTransactionSchema = z.object({
  signedTransaction: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { signedTransaction } = submitTransactionSchema.parse(body);

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const transactionBuffer = Buffer.from(signedTransaction, 'base64');
    const signature = await connection.sendRawTransaction(transactionBuffer, {
      skipPreflight: false,
    });
    await connection.confirmTransaction(signature, 'confirmed');

    return NextResponse.json({
      success: true,
      data: {
        signature,
        executedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
