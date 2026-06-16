#!/usr/bin/env node

/**
 * Epoch-style keeper for private prediction markets.
 *
 * Phase 1 (every tick): Scan for expired markets → resolve them on the ER.
 * Phase 2 (every tick): Scan for resolved markets → settle positions + commit.
 *
 * Each phase is a separate HTTP call so neither blocks the other.
 */

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const POLL_INTERVAL_MS = Number(process.env.CRANK_INTERVAL_MS || 5000);
const LIMIT = Number(process.env.CRANK_LIMIT || 10);
const REQUEST_TIMEOUT_MS = Number(process.env.CRANK_REQUEST_TIMEOUT_MS || 30000);
const CRANK_SECRET = process.env.CRANK_SECRET || '';
const ONCE = process.argv.includes('--once') || process.env.CRANK_ONCE === 'true';
const UNIFIED = process.argv.includes('--unified') || process.env.CRANK_UNIFIED === 'true';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateConfig() {
  if (!Number.isFinite(POLL_INTERVAL_MS) || POLL_INTERVAL_MS < 500) {
    throw new Error('CRANK_INTERVAL_MS must be a number >= 500');
  }

  if (!Number.isFinite(LIMIT) || LIMIT < 1 || LIMIT > 50) {
    throw new Error('CRANK_LIMIT must be a number between 1 and 50');
  }

  if (!Number.isFinite(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS < 1000) {
    throw new Error('CRANK_REQUEST_TIMEOUT_MS must be a number >= 1000');
  }
}

async function callEndpoint(path, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${APP_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CRANK_SECRET
          ? {
              authorization: `Bearer ${CRANK_SECRET}`,
              'x-crank-secret': CRANK_SECRET,
            }
          : {}),
      },
      body: JSON.stringify({ limit: LIMIT }),
      signal: controller.signal,
    });

    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      throw new Error(json?.error || `${label} failed with status ${response.status}`);
    }

    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}

async function tick() {
  const timestamp = new Date().toISOString();

  if (UNIFIED) {
    try {
      const result = await callEndpoint('/api/crank/run', 'crank');
      console.log(
        `[${timestamp}] CRANK    resolved=${result.resolve?.resolved ?? 0}/${result.resolve?.attempted ?? 0} settleMarkets=${result.settle?.candidateMarkets ?? 0}`
      );
      return;
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? `crank timed out after ${REQUEST_TIMEOUT_MS}ms`
        : error?.message || String(error);
      console.error(`[${timestamp}] CRANK error: ${message}`);
      return;
    }
  }

  // ── Phase 1: Resolve expired markets ──────────────────────────
  try {
    const resolve = await callEndpoint('/api/crank/price-markets', 'resolve');
    console.log(
      `[${timestamp}] RESOLVE  scanned=${resolve.scanned} attempted=${resolve.attempted} resolved=${resolve.resolved}`
    );

    for (const result of resolve.results || []) {
      if (result.success) {
        console.log(`  ✓ resolved ${result.market} :: ${result.question} :: ${result.resolveSignature}`);
      } else {
        console.log(`  ✗ failed   ${result.market} :: ${result.question} :: ${result.error}`);
      }
    }
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? `resolve timed out after ${REQUEST_TIMEOUT_MS}ms`
      : error?.message || String(error);
    console.error(`[${timestamp}] RESOLVE error: ${message}`);
  }

  // ── Phase 2: Settle positions for already-resolved markets ────
  try {
    const settle = await callEndpoint('/api/crank/settle-positions', 'settle');
    console.log(
      `[${timestamp}] SETTLE   scanned=${settle.scanned} markets=${settle.candidateMarkets}`
    );

    for (const marketResult of settle.results || []) {
      if (marketResult.settled > 0 || marketResult.attempted > 0) {
        console.log(
          `  market ${marketResult.market} :: attempted=${marketResult.attempted} settled=${marketResult.settled}`
        );
        for (const s of marketResult.settlementResults || []) {
          if (s.success) {
            console.log(`    ✓ settled ${s.trader} :: settle=${s.settleSignature} commit=${s.commitSignature}`);
          } else {
            console.log(`    ✗ failed  ${s.trader} :: ${s.error}`);
          }
        }
      }
    }
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? `settle timed out after ${REQUEST_TIMEOUT_MS}ms`
      : error?.message || String(error);
    console.error(`[${timestamp}] SETTLE error: ${message}`);
  }
}

async function main() {
  validateConfig();

  console.log(
    [
      `Starting Epoch-style price market keeper`,
      `app=${APP_URL}`,
      `interval=${POLL_INTERVAL_MS}ms`,
      `limit=${LIMIT}`,
      `mode=${ONCE ? 'once' : 'loop'}`,
      `endpoint=${UNIFIED ? 'unified' : 'phased'}`,
      `auth=${CRANK_SECRET ? 'enabled' : 'disabled'}`,
    ].join(' ')
  );

  do {
    try {
      await tick();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] crank error: ${error?.message || String(error)}`);
      if (ONCE) process.exitCode = 1;
    }

    if (!ONCE) {
      await sleep(POLL_INTERVAL_MS);
    }
  } while (!ONCE);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
