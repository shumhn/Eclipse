/**
 * MagicBlock Ephemeral Rollup Client for Eclipse Prediction Markets
 *
 * Uses MagicBlock's TEE-backed Ephemeral Rollups for private trading.
 * Positions are hidden inside the rollup until the market resolves,
 * then committed back to Solana L1.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SendTransactionError,
} from '@solana/web3.js';
import { getAuthToken } from '@magicblock-labs/ephemeral-rollups-sdk';

// ─── Constants ───────────────────────────────────────────────────────────────

/** The Anchor Program ID on Devnet */
export const EPHEMERAL_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    '79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t'
);

/** 
 * Find the global config PDA
 */
export function getConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    EPHEMERAL_PROGRAM_ID
  );
}

/** Base-layer Solana devnet RPC */
export const BASE_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

/** MagicBlock Ephemeral Rollup RPC (TEE-backed) */
export const EPHEMERAL_RPC_URL = 'https://devnet-tee.magicblock.app';

/** MagicBlock TEE auth endpoint */
export const TEE_AUTH_ENDPOINT = 'https://devnet-tee.magicblock.app';

/** MagicBlock Payments API base */
const PAYMENTS_BASE = 'https://payments.magicblock.app/v1/spl';

/** USDC devnet mint for MagicBlock */
export const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Connections
const baseConnection = new Connection(BASE_RPC_URL, 'confirmed');
const ephemeralConnection = new Connection(EPHEMERAL_RPC_URL, 'confirmed');

// ─── JWT Helpers ─────────────────────────────────────────────────────────────

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, bufferSeconds = 60): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return payload.exp <= Math.floor(Date.now() / 1000) + bufferSeconds;
}

function getTeeTokenStorageKey(publicKey: PublicKey): string {
  return `magicblock:tee-token:${publicKey.toBase58()}`;
}

// ─── TEE Auth ────────────────────────────────────────────────────────────────

/**
 * Fetch a TEE auth token from MagicBlock using the wallet's signMessage.
 * This token proves the user owns the wallet key and is required for
 * private balance queries and ephemeral operations.
 */
export async function fetchTeeAuthToken(
  publicKey: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<string> {
  const auth = await getAuthToken(TEE_AUTH_ENDPOINT, publicKey, signMessage);
  return auth.token;
}

export async function getOrFetchTeeAuthToken(
  publicKey: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<string> {
  const storageKey = getTeeTokenStorageKey(publicKey);

  if (typeof window !== 'undefined') {
    const cachedToken = window.sessionStorage.getItem(storageKey);
    if (cachedToken && !isJwtExpired(cachedToken)) {
      return cachedToken;
    }
  }

  const token = await fetchTeeAuthToken(publicKey, signMessage);

  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(storageKey, token);
  }

  return token;
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

async function post(
  path: string,
  body: Record<string, unknown>,
  token?: string
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${PAYMENTS_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MagicBlock API ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function get(path: string, token?: string) {
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const res = await fetch(`${PAYMENTS_BASE}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MagicBlock API ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ─── Balance Queries ─────────────────────────────────────────────────────────

export interface BalanceResponse {
  address: string;
  mint: string;
  ata: string;
  location: 'base' | 'ephemeral';
  balance: string;
}

/** Get base-layer USDC balance (standard Solana ATA) */
export async function getBaseBalance(
  address: string,
  token?: string
): Promise<BalanceResponse> {
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const res = await fetch(
    `${PAYMENTS_BASE}/balance?address=${address}&mint=${DEVNET_USDC_MINT}&cluster=devnet`,
    { headers }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`getBaseBalance failed (${res.status}): ${text}`);
  }
  return (await res.json()) as BalanceResponse;
}

/** Get ephemeral rollup (private) balance — requires TEE auth token */
export async function getPrivateBalance(
  address: string,
  token: string
): Promise<BalanceResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const res = await fetch(
    `${PAYMENTS_BASE}/private-balance?address=${address}&mint=${DEVNET_USDC_MINT}&cluster=devnet`,
    { headers }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`getPrivateBalance failed (${res.status}): ${text}`);
  }
  return (await res.json()) as BalanceResponse;
}

// ─── Deposit / Withdraw ──────────────────────────────────────────────────────

/** Deposit USDC from base layer into MagicBlock ephemeral vault */
export async function deposit(
  owner: string,
  amountUsdc: number,
  token?: string
) {
  return post(
    '/deposit',
    {
      owner,
      amount: Math.round(amountUsdc * 1_000_000),
      mint: DEVNET_USDC_MINT,
      cluster: 'devnet',
      initIfMissing: true,
      initVaultIfMissing: true,
      initAtasIfMissing: true,
      idempotent: true,
    },
    token
  );
}

/** Withdraw USDC from ephemeral vault back to base layer */
export async function withdraw(
  owner: string,
  amountUsdc: number,
  token?: string
) {
  return post(
    '/withdraw',
    {
      owner,
      mint: DEVNET_USDC_MINT,
      amount: Math.round(amountUsdc * 1_000_000),
      cluster: 'devnet',
      initAtasIfMissing: true,
      idempotent: true,
    },
    token
  );
}

// ─── Transaction Signing & Sending ───────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConnection(sendTo: string, ephemeralToken?: string): Connection {
  if (sendTo !== 'ephemeral') {
    return baseConnection;
  }

  if (ephemeralToken) {
    return new Connection(`${EPHEMERAL_RPC_URL}?token=${encodeURIComponent(ephemeralToken)}`, 'confirmed');
  }

  return ephemeralConnection;
}

function isAlreadyProcessedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.toLowerCase().includes('already been processed');
}

/**
 * Sign a transaction with the user's wallet and send it to the correct RPC.
 */
export async function signAndSend(
  txBase64: string,
  signTransaction: (
    tx: Transaction | VersionedTransaction
  ) => Promise<Transaction | VersionedTransaction>,
  opts: { sendTo?: string; ephemeralToken?: string } = {}
): Promise<string> {
  const buf = Buffer.from(txBase64, 'base64');
  const conn = getConnection(opts.sendTo || 'base', opts.ephemeralToken);
  const skipPreflight = opts.sendTo === 'ephemeral';

  // Deserialize (try versioned first, then legacy)
  let tx: Transaction | VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(buf);
  } catch {
    tx = Transaction.from(buf);
  }

  // Refresh blockhash
  const latest = await conn.getLatestBlockhash('confirmed');
  if (tx instanceof VersionedTransaction) {
    tx.message.recentBlockhash = latest.blockhash;
  } else {
    tx.recentBlockhash = latest.blockhash;
  }

  // Sign
  const signed = await signTransaction(tx);

  // Serialize
  const raw =
    signed instanceof VersionedTransaction
      ? signed.serialize()
      : signed.serialize();

  // Send
  const sig = await conn.sendRawTransaction(raw, { skipPreflight });

  // Confirm
  try {
    await conn.confirmTransaction(
      {
        signature: sig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      'confirmed'
    );
  } catch (confirmErr) {
    if (!isAlreadyProcessedError(confirmErr)) {
      throw confirmErr;
    }
  }

  return sig;
}

// ─── Health Check ────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<{ status: string }> {
  const res = await fetch('https://payments.magicblock.app/health');
  if (!res.ok) {
    throw new Error(`MagicBlock health check failed (${res.status})`);
  }
  return res.json();
}
