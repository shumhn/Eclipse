'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Users, ExternalLink, Shield, CheckCircle2, CircleDashed } from 'lucide-react';
import Navbar from '@/components/Navbar';
import TradePanel from '@/components/TradePanel';
import ClaimPanel from '@/components/ClaimPanel';
import ResolvePanel from '@/components/ResolvePanel';
import { Button } from '@/components/ui/button';
import {
  fetchMarket,
  Market,
  MarketPrices,
  calculatePriceFromReserves,
  explorerAccountUrl,
  explorerTxUrl,
  formatTimestamp,
  getMarketTimeRemaining,
  isMarketActive,
} from '@/lib/api';

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const marketId = params.id as string;

  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMarket = async () => {
    if (!marketId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchMarket(marketId);
      setMarket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load market');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarket();
  }, [marketId]);

  const positionsHidden = market?.positionsHidden ?? false;
  const prices: MarketPrices = market
    ? positionsHidden
      ? { yes: 0.5, no: 0.5 }
      : calculatePriceFromReserves(
          market.account.yes_token_supply_minted,
          market.account.no_token_supply_minted
        )
    : { yes: 0.5, no: 0.5 };

  const active = market ? isMarketActive(market) : false;
  const timeRemaining = market ? getMarketTimeRemaining(market) : '';
  const endDate = market ? formatTimestamp(market.account.end_time) : new Date();
  const createdDate = market ? formatTimestamp(market.account.creation_time) : new Date();
  const tradingEnabled = market?.tradingEnabled ?? true;
  
  const baseLiquidity = market ? parseInt(market.account.initial_liquidity, 16) / 1_000_000 : 0;
  const yesMinted = market && !positionsHidden ? parseInt(market.account.yes_token_supply_minted, 16) / 1_000_000 : 0;
  const noMinted = market && !positionsHidden ? parseInt(market.account.no_token_supply_minted, 16) / 1_000_000 : 0;
  const totalVol = baseLiquidity + yesMinted + noMinted;

  const proofSteps = market ? [
    {
      label: 'Created on Solana',
      complete: Boolean(market.proof?.createSignature || market.publicKey),
      signature: market.proof?.createSignature,
    },
    {
      label: 'Delegated into MagicBlock',
      complete: Boolean(market.delegated),
      signature: market.proof?.marketDelegationSignature || undefined,
    },
    {
      label: 'Private market state initialized',
      complete: Boolean(market.positionsHidden || market.proof?.privateStateInitializationSignature),
      signature: market.proof?.privateStateInitializationSignature || undefined,
    },
    {
      label: 'Resolved by oracle',
      complete: Boolean(market.account.resolved),
      signature: market.proof?.resolveSignature || undefined,
    },
    {
      label: 'Committed back toward L1',
      complete: Boolean(market.proof?.commitSignature),
      signature: market.proof?.commitSignature || undefined,
    },
  ] : [];

  return (
    <div className="min-h-screen bg-eclipse-bg text-eclipse-text-main">
      <Navbar />

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-[1440px] mx-auto">
          {/* Back Button */}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-eclipse-text-muted hover:text-eclipse-text-main mb-6 font-medium text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Markets
          </button>

          {/* Loading */}
          {loading && (
            <div className="animate-pulse">
              <div className="h-8 bg-eclipse-border rounded w-24 mb-4" />
              <div className="h-12 bg-eclipse-border rounded w-3/4 mb-8" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 h-96 bg-eclipse-border rounded-lg" />
                <div className="h-96 bg-eclipse-border rounded-lg" />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-eclipse-red/10 border border-eclipse-red/20 rounded-lg p-6 text-center max-w-lg mx-auto">
              <p className="text-eclipse-red font-medium mb-4">{error}</p>
              <button 
                onClick={loadMarket}
                className="px-4 py-2 bg-eclipse-red/20 hover:bg-eclipse-red/30 text-eclipse-red rounded-lg transition-colors font-semibold text-sm"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Market Content */}
          {!loading && market && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
              {/* Left Column - Market Info */}
              <div className="space-y-6">
                {/* Header Info */}
                <div>
                  <div className="flex items-center gap-3 mb-3 text-sm font-medium text-eclipse-text-muted">
                    <span className="flex items-center gap-1">
                       <img src="/eclipse-logo.svg" alt="Avatar" className="w-5 h-5 rounded-full border border-eclipse-border" />
                       {market.account.creator.slice(0, 6)}...{market.account.creator.slice(-4)}
                    </span>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{timeRemaining}</span>
                    </div>
                  </div>

                  <h1 className="font-bold text-2xl md:text-3xl lg:text-4xl leading-tight mb-4 text-eclipse-text-main">
                    {market.account.question}
                  </h1>

                  {/* Top Stats */}
                  <div className="flex items-center gap-4 text-sm text-eclipse-text-muted mb-8">
                    <span>${totalVol.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Vol.</span>
                    {positionsHidden && (
                      <span className="flex items-center gap-1 text-eclipse-green bg-eclipse-green/10 px-2 py-0.5 rounded">
                        <Shield className="w-3.5 h-3.5" /> TEE Shielded
                      </span>
                    )}
                  </div>

                  {/* Price Chart / Visual Placeholder */}
                  <div className="eclipse-card p-6 h-[300px] flex flex-col mb-8">
                     <div className="flex justify-between items-center mb-6">
                        <div className="flex items-end gap-3">
                           <span className="text-4xl font-bold text-eclipse-green">{(prices.yes * 100).toFixed(0)}¢</span>
                           <span className="text-sm font-semibold text-eclipse-text-muted mb-1 border-b border-dashed border-eclipse-text-muted pb-0.5">Yes</span>
                        </div>
                        <div className="flex gap-2">
                           {['1H', '1D', '1W', 'ALL'].map(tf => (
                              <button key={tf} className="px-3 py-1 rounded text-xs font-semibold text-eclipse-text-muted hover:text-eclipse-text-main hover:bg-eclipse-panel transition-colors">
                                {tf}
                              </button>
                           ))}
                        </div>
                     </div>
                     {/* Chart Area or Privacy Shield */}
                     <div className="flex-1 relative flex flex-col items-center justify-center border-t border-eclipse-border/50 pt-8 mt-2">
                       {positionsHidden ? (
                         <>
                           <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-eclipse-green/5 via-eclipse-bg/0 to-eclipse-bg/0 pointer-events-none"></div>
                           <Shield className="w-16 h-16 text-eclipse-green/20 mb-4" />
                           <h3 className="text-lg font-bold text-eclipse-text-main mb-1">Price Discovery Shielded</h3>
                           <p className="text-sm text-eclipse-text-muted max-w-sm text-center">
                             This market is running inside a MagicBlock TEE. Live odds, positions, and volumes are completely hidden to prevent front-running.
                           </p>
                         </>
                       ) : (
                         <>
                           <CircleDashed className="w-12 h-12 text-eclipse-text-muted/20 mb-3" />
                           <p className="text-sm text-eclipse-text-muted">Insufficient historical data to generate chart.</p>
                         </>
                       )}
                     </div>
                  </div>
                </div>

                {/* About Section */}
                <div className="eclipse-card p-6">
                  <h2 className="font-bold text-lg mb-4 border-b border-eclipse-border pb-4">About</h2>
                  <div className="space-y-4 text-sm text-eclipse-text-muted">
                    <p>
                      This market resolves to <strong>{market.account.resolvable ? 'Yes' : 'No'}</strong> if the specified conditions are met by the end date.
                    </p>
                    {positionsHidden && (
                      <p className="text-eclipse-text-main p-3 bg-eclipse-panel rounded-lg border border-eclipse-border flex gap-2">
                        <Shield className="w-5 h-5 text-eclipse-green shrink-0 mt-0.5" />
                        <span>This market is running inside MagicBlock's Ephemeral Rollup (TEE). Live positions and pool balances are hidden until the oracle resolves the market.</span>
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 mt-6 pt-6 border-t border-eclipse-border text-sm">
                    <div>
                      <div className="text-eclipse-text-muted mb-1">Created By</div>
                      <div className="text-eclipse-text-main font-mono text-xs flex items-center gap-2">
                        {market.account.creator.slice(0, 6)}...{market.account.creator.slice(-4)}
                        <a href={`https://explorer.solana.com/address/${market.account.creator}?cluster=devnet`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 text-eclipse-text-muted hover:text-eclipse-text-main" />
                        </a>
                      </div>
                    </div>
                    <div>
                      <div className="text-eclipse-text-muted mb-1">Contract Address</div>
                      <div className="text-eclipse-text-main font-mono text-xs flex items-center gap-2">
                        {market.publicKey.slice(0, 6)}...{market.publicKey.slice(-4)}
                        <a href={`https://explorer.solana.com/address/${market.publicKey}?cluster=devnet`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 text-eclipse-text-muted hover:text-eclipse-text-main" />
                        </a>
                      </div>
                    </div>
                    <div>
                      <div className="text-eclipse-text-muted mb-1">Start Date</div>
                      <div className="text-eclipse-text-main font-medium">{createdDate.toLocaleDateString()}</div>
                    </div>
                    <div>
                      <div className="text-eclipse-text-muted mb-1">End Date</div>
                      <div className="text-eclipse-text-main font-medium">{endDate.toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>

                {/* Proof of Execution */}
                {market.tracked && (
                  <div className="eclipse-card p-6">
                    <h2 className="font-bold text-lg mb-2">Proof of Execution</h2>
                    <p className="text-sm text-eclipse-text-muted mb-6">
                      Honest devnet evidence for this market&apos;s real lifecycle.
                    </p>

                    <div className="space-y-3">
                      {proofSteps.map((step) => (
                        <div
                          key={step.label}
                          className={`flex items-center justify-between gap-4 rounded-lg border p-3 text-sm ${
                            step.complete
                              ? 'border-eclipse-green/20 bg-eclipse-green/5'
                              : 'border-eclipse-border bg-eclipse-bg'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {step.complete ? (
                              <CheckCircle2 className="h-4 w-4 text-eclipse-green" />
                            ) : (
                              <CircleDashed className="h-4 w-4 text-eclipse-text-muted" />
                            )}
                            <span className={step.complete ? 'font-medium text-eclipse-text-main' : 'text-eclipse-text-muted'}>{step.label}</span>
                          </div>

                          {step.signature ? (
                            <a
                              href={explorerTxUrl(step.signature)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-eclipse-blue hover:underline text-xs"
                            >
                              View tx
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="font-medium text-eclipse-text-muted text-xs">
                              {step.complete ? 'Verified' : 'Pending'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column - Trade Panel */}
              <div>
                <div className="sticky top-24">
                  {market.account.resolved ? (
                    <ClaimPanel
                      market={market}
                      onClaimComplete={loadMarket}
                    />
                  ) : (
                    <TradePanel
                      marketAddress={marketId}
                      prices={prices}
                      onTradeComplete={loadMarket}
                      tradingEnabled={tradingEnabled}
                      positionsHidden={positionsHidden}
                    />
                  )}
                  
                  {market.account.resolvable && !market.account.resolved && (
                    <ResolvePanel
                      market={market}
                      onResolveComplete={loadMarket}
                    />
                  )}
                  
                  {/* No order book for AMM */}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
