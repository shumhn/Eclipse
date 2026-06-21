'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAccounts, AddressType } from '@phantom/react-sdk';
import { ArrowLeft, EyeOff, RefreshCw, Shield, Wallet } from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import Navbar from '@/components/Navbar';
import CryptoIcon from '@/components/CryptoIcon';
import { fetchMarket, fetchMarkets, fetchPosition, Market, Position } from '@/lib/api';
import { getOrFetchTeeAuthToken } from '@/lib/trading';

type PortfolioEntry = {
  market: Market;
  position: Position | null;
};

function formatUsdc(raw?: string) {
  if (!raw) return '$0.00';
  const value = Number(BigInt(raw)) / 1_000_000;
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatShares(raw?: string) {
  if (!raw) return '0.00';
  const value = Number(BigInt(raw)) / 1_000_000;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}


function PortfolioContent() {
  const searchParams = useSearchParams();
  const accounts = useAccounts();
  const marketId = searchParams.get('market');
  const solanaAccount = accounts?.find((account) => account.addressType === AddressType.solana);
  const walletAddress = solanaAccount?.address || '';

  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'resolved' | 'unspent'>('active');

  const loadPortfolio = useCallback(async () => {
    if (!walletAddress) {
      setEntries([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const signer = (window as any).phantom?.solana;
      if (!signer?.signMessage) {
        throw new Error('Wallet cannot sign MagicBlock auth message');
      }

      const teeToken = await getOrFetchTeeAuthToken(
        new PublicKey(walletAddress),
        async (msg: Uint8Array) => (await signer.signMessage(msg, 'utf8')).signature,
      );

      const markets = marketId
        ? [await fetchMarket(marketId)].filter(Boolean) as Market[]
        : await fetchMarkets();

      const loaded = await Promise.all(
        markets.map(async (market) => {
          const position = await fetchPosition({
            marketAddress: market.publicKey,
            walletAddress,
            teeToken,
          }).catch(() => null);

          return { market, position };
        })
      );

      setEntries(loaded.filter((entry) => Boolean(entry.position)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, [marketId, walletAddress]);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  const totals = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        if (!entry.position) return acc;
        acc.collateral += BigInt(entry.position.collateralDeposited || '0');
        acc.available += BigInt(entry.position.collateralAvailable || '0');
        acc.yes += BigInt(entry.position.yesShares || '0');
        acc.no += BigInt(entry.position.noShares || '0');
        return acc;
      },
      {
        collateral: BigInt(0),
        available: BigInt(0),
        yes: BigInt(0),
        no: BigInt(0),
      }
    );
  }, [entries]);

  const hasParkedFunds = entries.some((entry) => {
    if (!entry.position) return false;
    return (
      BigInt(entry.position.collateralAvailable || '0') > BigInt(0) &&
      BigInt(entry.position.yesShares || '0') === BigInt(0) &&
      BigInt(entry.position.noShares || '0') === BigInt(0)
    );
  });

  const filteredEntries = useMemo(() => {
    return entries.filter(({ market, position }) => {
      const yes = BigInt(position?.yesShares || '0');
      const no = BigInt(position?.noShares || '0');
      const available = BigInt(position?.collateralAvailable || '0');

      if (filter === 'active') return !market.account.resolved && (yes > 0 || no > 0);
      if (filter === 'resolved') return market.account.resolved && (yes > 0 || no > 0);
      if (filter === 'unspent') return available > 0 && yes === BigInt(0) && no === BigInt(0);
      return false; 
    });
  }, [entries, filter]);

  return (
    <div className="min-h-screen bg-eclipse-bg text-eclipse-text-main">
      <Navbar />

      <main className="px-4 pb-16 pt-36">
        <div className="mx-auto max-w-[1120px]">
          <Link
            href={marketId ? `/markets/${marketId}` : '/markets'}
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-eclipse-text-muted transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {marketId ? 'Back to Market' : 'Back to Markets'}
          </Link>

          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-eclipse-green/20 bg-eclipse-green/10 px-3 py-1 text-xs font-semibold text-eclipse-green">
                <Shield className="h-3.5 w-3.5" />
                Owner-only view
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">My Private Trades</h1>
              <p className="mt-2 max-w-2xl text-sm text-eclipse-text-muted">
                Public users cannot see your side or size. This page shows only your wallet&apos;s private TEE position.
              </p>
            </div>

            <button
              type="button"
              onClick={loadPortfolio}
              disabled={loading || !walletAddress}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {!walletAddress && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
              <Wallet className="mx-auto mb-4 h-10 w-10 text-eclipse-text-muted" />
              <h2 className="text-xl font-bold text-white">Connect your wallet</h2>
              <p className="mt-2 text-sm text-eclipse-text-muted">
                Connect the same wallet that placed the trade to view your private position.
              </p>
            </div>
          )}

          {walletAddress && (
            <>
              <div className="mb-2 grid gap-4 md:grid-cols-4">
                <StatCard label="Total USDC Deposited" value={formatUsdc(totals.collateral.toString())} />
                <StatCard label="Unspent USDC" value={formatUsdc(totals.available.toString())} />
                <StatCard label="Yes Shares Owned" value={formatShares(totals.yes.toString())} />
                <StatCard label="No Shares Owned" value={formatShares(totals.no.toString())} />
              </div>
              <p className="mb-6 text-xs text-eclipse-text-muted/70">
                Note: Shares are virtual AMM claims. After resolution, payout is unspent USDC plus your proportional share of final market reserves for the winning side.
              </p>

              {hasParkedFunds && (
                <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                  {entries.some(e => e.market.account.resolved && BigInt(e.position?.collateralAvailable || '0') > 0 && BigInt(e.position?.yesShares || '0') === BigInt(0) && BigInt(e.position?.noShares || '0') === BigInt(0)) 
                    ? "You have unspent USDC in resolved markets. It is perfectly safe — it will be fully refunded to your wallet when you click Claim on the market page."
                    : "Your USDC reached the private TEE position, but no Yes/No shares were bought for this market yet. Use Trade Again with an amount up to the unspent TEE balance."}
                </div>
              )}

              {error && (
                <div className="mb-6 rounded-xl border border-eclipse-red/20 bg-eclipse-red/10 p-4 text-sm font-medium text-eclipse-red">
                  {error}
                </div>
              )}

              <div className="mb-6 flex gap-2">
                {(['active', 'resolved', 'unspent'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      filter === f
                        ? 'bg-white text-black'
                        : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-eclipse-text-muted">
                  Loading private positions...
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
                  <EyeOff className="mx-auto mb-4 h-10 w-10 text-eclipse-text-muted" />
                  <h2 className="text-xl font-bold text-white">No private positions found</h2>
                  <p className="mt-2 text-sm text-eclipse-text-muted">
                    Try changing your filter settings, or if you just traded, wait a few seconds and refresh.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredEntries.map(({ market, position }) => (
                    <Link
                      key={market.publicKey}
                      href={`/markets/${market.publicKey}`}
                      className="block rounded-2xl border border-white/10 bg-[#16191d] p-5 transition-colors hover:border-eclipse-green/40 hover:bg-[#1b1f24]"
                    >
                      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-4">
                          <CryptoIcon
                            asset={market.priceMarket?.asset}
                            size={44}
                            className="rounded-xl border border-white/10"
                          />
                          <div>
                            <h2 className="max-w-2xl text-lg font-bold leading-snug text-white">
                              {market.account.question}
                            </h2>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-eclipse-text-muted">
                              <span className="rounded-full bg-eclipse-green/10 px-2 py-1 font-semibold text-eclipse-green">
                                {market.positionsHidden ? 'TEE Shielded' : 'On L1'}
                              </span>
                              <span>{market.account.resolved ? 'Resolved' : 'Active'}</span>
                              <span>Position {position?.publicKey.slice(0, 6)}...{position?.publicKey.slice(-4)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-6 md:gap-10">
                          <MiniStat label="USDC Deposited" value={formatUsdc(position?.collateralDeposited)} />
                          <MiniStat label="Yes Shares" value={formatShares(position?.yesShares)} />
                          <MiniStat label="No Shares" value={formatShares(position?.noShares)} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-eclipse-text-muted">{label}</div>
      <div className="mt-2 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-eclipse-text-muted">{label}</div>
      <div className="mt-1 text-sm font-bold text-white">{value}</div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={null}>
      <PortfolioContent />
    </Suspense>
  );
}
