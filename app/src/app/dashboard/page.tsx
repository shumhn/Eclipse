'use client';

import { useEffect, useState } from 'react';
import { usePhantom, useAccounts, useConnect, AddressType } from '@phantom/react-sdk';
import Link from 'next/link';
import {
  Wallet,
  TrendingUp,
  Shield,
  Clock,
  ArrowRight,
  Lock,
  Eye,
  Plus,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { fetchMarkets, Market, isMarketActive } from '@/lib/api';

export default function DashboardPage() {
  const { isConnected, isLoading } = usePhantom();
  const { connect, isConnecting } = useConnect();
  const accounts = useAccounts();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  // Get the Solana address from connected accounts
  // Note: AddressType.solana returns "Solana" (capitalized)
  const solanaAccount = accounts?.find((a) => a.addressType === AddressType.solana);
  const publicKeyString = solanaAccount?.address || '';

  useEffect(() => {
    fetchMarkets()
      .then((data) => setMarkets(data))
      .finally(() => setLoading(false));
  }, []);

  const activeMarkets = markets.filter(isMarketActive).slice(0, 5);

  // Show loading while SDK initializes
  if (isLoading) {
    return (
      <div className="min-h-screen bg-off-white">
        <Navbar />
        <main className="pt-24 pb-16 px-6">
          <div className="max-w-4xl mx-auto text-center py-20">
            <div className="w-24 h-24 bg-dark/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Wallet className="w-12 h-12 text-dark/40" />
            </div>
            <h1 className="font-black text-4xl mb-4">Loading...</h1>
          </div>
        </main>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-off-white">
        <Navbar />
        <main className="pt-24 pb-16 px-6">
          <div className="max-w-4xl mx-auto text-center py-20">
            <div className="w-24 h-24 bg-dark/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Wallet className="w-12 h-12 text-dark/40" />
            </div>
            <h1 className="font-black text-4xl mb-4">Connect Your Wallet</h1>
            <p className="text-dark/60 text-lg mb-8 max-w-md mx-auto">
              Connect your Solana wallet to create markets, place private trades, and follow the
              MagicBlock prediction market lifecycle.
            </p>
            <Button
              variant="hero"
              size="xl"
              onClick={() => connect({ provider: 'injected' })}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect Phantom'}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-off-white">
      <Navbar />

      <main className="pt-24 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="font-black text-4xl mb-2">Dashboard</h1>
              <p className="text-dark/60 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                Connected: {publicKeyString ? `${publicKeyString.slice(0, 8)}...` : 'Wallet'}
              </p>
            </div>

            <Link href="/markets">
              <Button variant="hero" size="lg">
                <Plus className="w-5 h-5" />
                New Trade
              </Button>
            </Link>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Market Mode"
              value="PER"
              subtext="Private live state"
              icon={<Wallet className="w-5 h-5" />}
              color="bg-neon-green"
            />
            <StatCard
              label="Live Trading"
              value="On"
              subtext="MagicBlock devnet"
              icon={<TrendingUp className="w-5 h-5" />}
              color="bg-neon-purple"
            />
            <StatCard
              label="Position Privacy"
              value="Shielded"
              subtext="Hidden until resolution"
              icon={<Shield className="w-5 h-5" />}
              color="bg-neon-green"
            />
            <StatCard
              label="Claim Status"
              value="Pending"
              subtext="Final L1 step in progress"
              icon={<Clock className="w-5 h-5" />}
              color="bg-gray-200"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Positions Panel */}
            <div className="lg:col-span-2">
              <div className="bg-white border-2 border-dark rounded-2xl p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-bold text-xl">Your Positions</h2>
                  <div className="flex items-center gap-2 text-sm text-neon-green font-medium">
                    <Lock className="w-4 h-4" />
                    <span>Encrypted</span>
                  </div>
                </div>

                {/* Empty State */}
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-dark/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Eye className="w-8 h-8 text-dark/30" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">No positions yet</h3>
                  <p className="text-dark/60 text-sm mb-4">
                    Trading, delegation, and settlement are live. Final portfolio aggregation is being polished around the current PER flow.
                  </p>
                  <Link href="/markets">
                    <Button variant="heroSecondary">
                      Browse Markets
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-6">
              {/* Active Markets */}
              <div className="bg-white border-2 border-dark rounded-2xl p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="font-bold text-xl mb-4">Hot Markets</h2>

                {loading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeMarkets.map((market) => (
                      <Link
                        key={market.publicKey}
                        href={`/markets/${market.publicKey}`}
                        className="block p-3 rounded-xl border border-dark/10 hover:border-dark/30 transition-colors"
                      >
                        <p className="font-medium text-sm line-clamp-2">
                          {market.account.question}
                        </p>
                      </Link>
                    ))}
                    <Link href="/markets">
                      <Button variant="heroSecondary" size="sm" className="w-full mt-2">
                        View All Markets
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              <Link href="/portfolio">
                <div className="bg-dark text-white rounded-2xl p-6 border-2 border-dark hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-neon-green/20 rounded-xl flex items-center justify-center">
                      <Clock className="w-5 h-5 text-neon-green" />
                    </div>
                    <div>
                      <h3 className="font-bold">Lifecycle Status</h3>
                      <p className="text-white/60 text-sm">What works today</p>
                    </div>
                  </div>
                  <p className="text-white/70 text-sm">
                    Inspect real lifecycle proof, tracked markets, and current rollout status
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  icon,
  color,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white border-2 border-dark rounded-xl p-5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-dark/60">{label}</span>
        <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="font-black text-3xl mb-1">{value}</p>
      <p className="text-sm text-dark/50">{subtext}</p>
    </div>
  );
}
