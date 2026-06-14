'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { ArrowRight, CheckCircle2, Clock3, ExternalLink, Lock, ShieldAlert, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { explorerAccountUrl, explorerTxUrl, fetchTrackedMarkets, TrackedMarketsResponse } from '@/lib/api';

const completedSteps = [
  'Create a market shell on Solana L1',
  'Delegate the market and position into MagicBlock PER',
  'Initialize private market state inside the rollup',
  'Place private YES / NO trades with shielded live positions',
  'Resolve and settle the market inside PER',
];

const pendingSteps = [
  'Commit and undelegate the settled position back from DELeGG to the program',
  'Expose final payout claim UX on Solana L1',
];

export default function PortfolioPage() {
  const [tracked, setTracked] = useState<TrackedMarketsResponse | null>(null);

  useEffect(() => {
    fetchTrackedMarkets()
      .then(setTracked)
      .catch(() => setTracked(null));
  }, []);

  return (
    <div className="min-h-screen bg-eclipse-bg text-eclipse-text-main">
      <Navbar />

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-[1440px] mx-auto">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-eclipse-green/20 bg-eclipse-green/10 px-4 py-2 mb-4">
              <Sparkles className="h-4 w-4 text-eclipse-green" />
              <span className="text-sm font-semibold text-eclipse-green">Current build status</span>
            </div>
            <h1 className="font-bold text-3xl md:text-4xl">Private Market Lifecycle</h1>
            <p className="mt-3 max-w-3xl text-eclipse-text-muted">
              This page shows what the current MagicBlock prediction market build already supports end to end,
              and what part is still being finished before payouts can be claimed back on Solana L1.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
            <section className="eclipse-card p-6">
              <div className="mb-6 flex items-center gap-3 border-b border-eclipse-border pb-4">
                <Lock className="h-6 w-6 text-eclipse-green" />
                <h2 className="text-xl font-bold">What Works Right Now</h2>
              </div>

              <div className="space-y-3">
                {completedSteps.map((step) => (
                  <div key={step} className="flex items-start gap-3 rounded-lg border border-eclipse-green/20 bg-eclipse-green/5 p-4">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-eclipse-green" />
                    <p className="text-sm font-medium">{step}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="eclipse-card p-6">
              <div className="mb-6 flex items-center gap-3 border-b border-eclipse-border pb-4">
                <ShieldAlert className="h-6 w-6 text-eclipse-red" />
                <h2 className="text-xl font-bold">Still Pending</h2>
              </div>

              <div className="space-y-3">
                {pendingSteps.map((step) => (
                  <div key={step} className="flex items-start gap-3 rounded-lg border border-eclipse-border bg-eclipse-bg p-4">
                    <Clock3 className="mt-0.5 h-5 w-5 flex-shrink-0 text-eclipse-text-muted" />
                    <p className="text-sm font-medium">{step}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-lg border border-eclipse-border bg-eclipse-bg p-4 text-sm text-eclipse-text-muted">
                Trades are useful for demonstrating private market creation, delegation, live PER state,
                and oracle settlement today. Final claim/withdraw UX is being held back until the L1 undelegation step is stable.
              </div>

              <Link href="/markets" className="mt-6 block">
                <button className="w-full py-3 bg-eclipse-blue hover:bg-[#2482B6] text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                  Open Live Markets
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
            </section>
          </div>

          <section className="mt-6 eclipse-card p-6">
            <div className="mb-6 flex items-center justify-between gap-3 border-b border-eclipse-border pb-4">
              <div>
                <h2 className="text-xl font-bold">Tracked Proof Feed</h2>
                <p className="text-sm text-eclipse-text-muted mt-1">
                  Markets created through this app, with real signatures and account links.
                </p>
              </div>
              <div className="rounded-full border border-eclipse-border bg-eclipse-bg px-3 py-1 text-sm font-medium text-eclipse-text-muted">
                {tracked?.totalMarkets ?? 0} tracked markets
              </div>
            </div>

            <div className="space-y-4">
              {tracked?.markets?.length ? tracked.markets.map((market) => (
                <div key={market.publicKey} className="rounded-lg border border-eclipse-border bg-eclipse-bg p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-bold text-lg">{market.question}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-eclipse-text-muted">
                        <a href={explorerAccountUrl(market.publicKey)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-eclipse-text-main transition-colors">
                          Market account
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        {market.creatorPosition && (
                          <span className="flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-eclipse-text-muted"></span>
                            Creator position: {market.creatorPosition.slice(0, 8)}...{market.creatorPosition.slice(-6)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link href={`/markets/${market.publicKey}`}>
                      <button className="px-4 py-2 border border-eclipse-border hover:bg-eclipse-panel text-eclipse-text-main font-semibold rounded-lg transition-colors whitespace-nowrap">
                         Open Market
                      </button>
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <MiniProof label="Create" signature={market.transactionSignature} />
                    <MiniProof label="Market delegation" signature={market.marketDelegationSignature || undefined} />
                    <MiniProof label="Creator position delegation" signature={market.creatorPositionDelegationSignature || undefined} />
                    <MiniProof label="Private state init" signature={market.privateStateInitializationSignature || undefined} />
                    <MiniProof label="Resolve" signature={market.resolveSignature || undefined} />
                    <MiniProof label="Commit" signature={market.commitSignature || undefined} />
                  </div>
                </div>
              )) : (
                <div className="rounded-lg border border-dashed border-eclipse-border bg-eclipse-bg p-8 text-center text-sm text-eclipse-text-muted">
                  No tracked markets yet. Create one from the Markets page to populate a real proof feed.
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function MiniProof({ label, signature }: { label: string; signature?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-eclipse-border bg-eclipse-panel px-3 py-2 text-xs">
      <span className="font-medium text-eclipse-text-muted">{label}</span>
      {signature ? (
        <a
          href={explorerTxUrl(signature)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-eclipse-blue hover:underline"
        >
          View tx
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-eclipse-text-muted/50">Pending</span>
      )}
    </div>
  );
}
