/**
 * Client-side trading utilities for the MagicBlock prediction market flow.
 * Users sign base-layer and PER transactions with their own wallet.
 */

import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const RPC_URL = 'https://api.devnet.solana.com';

export interface TradeParams {
  marketAddress: string;
  side: 'yes' | 'no';
  amountUsdc: number; // Amount in USDC units (not lamports)
  walletAddress: string;
}

export interface PreparedTransaction {
  transaction: string; // Base64 encoded transaction
  message: string;
  estimatedFee: number;
  positionAddress?: string;
  alreadyExists?: boolean;
  sendTo?: 'base' | 'ephemeral';
}

export interface TradeResult {
  signature: string;
  market: string;
  side: 'yes' | 'no';
  amount: string;
  executedAt: string;
}

/**
 * Request a prepared transaction from the server
 * The server builds the transaction but does NOT sign it
 * The user signs it client-side
 */
export async function prepareTradeTransaction(params: TradeParams): Promise<PreparedTransaction> {
  const res = await fetch(`${API_BASE}/api/trading/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      market: params.marketAddress,
      side: params.side,
      amountUsdc: params.amountUsdc,
      walletAddress: params.walletAddress,
    }),
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to prepare transaction');
  }

  return json.data;
}

export async function preparePositionTransaction(params: Omit<TradeParams, 'side'>): Promise<PreparedTransaction> {
  const res = await fetch(`${API_BASE}/api/trading/prepare-position`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      market: params.marketAddress,
      amountUsdc: params.amountUsdc,
      walletAddress: params.walletAddress,
    }),
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to prepare position setup transaction');
  }

  return json.data;
}

export async function delegatePrivatePosition(params: {
  marketAddress: string;
  walletAddress: string;
}): Promise<{ signature: string | null; alreadyDelegated: boolean; positionAddress: string }> {
  const res = await fetch(`${API_BASE}/api/trading/delegate-position`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      market: params.marketAddress,
      walletAddress: params.walletAddress,
    }),
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to delegate private position');
  }

  return json.data;
}

export async function preparePrivateTradeTransaction(params: TradeParams): Promise<PreparedTransaction> {
  const res = await fetch(`${API_BASE}/api/trading/prepare-private`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      market: params.marketAddress,
      side: params.side,
      amountUsdc: params.amountUsdc,
      walletAddress: params.walletAddress,
    }),
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to prepare private trade transaction');
  }

  return json.data;
}

/**
 * Submit a signed transaction to the network
 */
export async function submitSignedTransaction(
  signedTransaction: string // Base64 encoded signed transaction
): Promise<TradeResult> {
  const res = await fetch(`${API_BASE}/api/trading/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransaction }),
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to submit transaction');
  }

  return json.data;
}

/**
 * Execute a trade with client-side signing using Phantom wallet
 * This is the main entry point for trading
 */
export async function executeTradeWithWallet(
  params: TradeParams,
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>
): Promise<TradeResult> {
  // Step 1: Get prepared transaction from server
  const prepared = await prepareTradeTransaction(params);

  // Step 2: Decode the transaction
  const transactionBuffer = Buffer.from(prepared.transaction, 'base64');
  const transaction = Transaction.from(transactionBuffer);

  // Step 3: Sign with user's wallet
  const signedTransaction = await signTransaction(transaction);

  // Step 4: Serialize and submit
  const serialized = (signedTransaction as Transaction).serialize();
  const signedBase64 = Buffer.from(serialized).toString('base64');

  // Step 5: Submit to network
  const result = await submitSignedTransaction(signedBase64);

  return result;
}

/**
 * Alternative: Direct submission to Solana network
 * Bypasses our server entirely after getting the prepared tx
 */
export async function executeTradeDirectly(
  params: TradeParams,
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>
): Promise<string> {
  const connection = new Connection(RPC_URL, 'confirmed');

  // Get prepared transaction
  const prepared = await prepareTradeTransaction(params);

  // Decode and sign
  const transactionBuffer = Buffer.from(prepared.transaction, 'base64');
  const transaction = Transaction.from(transactionBuffer);
  const signedTransaction = await signTransaction(transaction);

  // Send directly to Solana
  const signature = await connection.sendRawTransaction(
    (signedTransaction as Transaction).serialize(),
    { skipPreflight: false }
  );

  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

export async function resolveMarket(params: {
  marketAddress: string;
  outcome: 'yes' | 'no';
}): Promise<{ resolveSignature: string; commitSignature: string }> {
  const res = await fetch(`${API_BASE}/api/trading/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      market: params.marketAddress,
      outcome: params.outcome,
    }),
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to resolve market');
  }

  return json.data;
}

export async function prepareSettleTransaction(params: {
  marketAddress: string;
  walletAddress: string;
}): Promise<PreparedTransaction> {
  const res = await fetch(`${API_BASE}/api/trading/prepare-settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      market: params.marketAddress,
      walletAddress: params.walletAddress,
    }),
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to prepare settle transaction');
  }

  return json.data;
}

export async function prepareClaimTransaction(params: {
  marketAddress: string;
  walletAddress: string;
}): Promise<PreparedTransaction> {
  const res = await fetch(`${API_BASE}/api/trading/prepare-claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      market: params.marketAddress,
      walletAddress: params.walletAddress,
    }),
  });

  const json = await res.json();
  if (!json.success) {
  }

  return json.data;
}

export async function commitPosition(params: {
  marketAddress: string;
  walletAddress: string;
}): Promise<{ commitSignature: string }> {
  const res = await fetch(`${API_BASE}/api/trading/commit-position`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      market: params.marketAddress,
      walletAddress: params.walletAddress,
    }),
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to commit position');
  }

  return json.data;
}
