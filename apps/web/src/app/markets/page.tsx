'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Filter, RefreshCw, TrendingUp, Shield, Plus, Zap, AlertCircle } from 'lucide-react';
import Navbar from '@/components/Navbar';
import MarketCard from '@/components/MarketCard';
import CreateMarketModal from '@/components/CreateMarketModal';
import { Button } from '@/components/ui/button';
import { fetchMarkets, fetchTrackedMarkets, Market, isMarketActive, CreateMarketResult } from '@/lib/api';

type FilterType = 'all' | 'active' | 'resolved';

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [trackedAddresses, setTrackedAddresses] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all markets and tracked info in parallel
      const [allData, trackedData] = await Promise.all([
        fetchMarkets(),
        fetchTrackedMarkets().catch(() => null),
      ]);
      setMarkets(allData);

      // Track which markets are ours
      if (trackedData?.markets) {
        setTrackedAddresses(new Set(trackedData.markets.map(m => m.publicKey)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load markets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  const handleMarketCreated = (result: CreateMarketResult) => {
    // Add the new market address to tracked set
    setTrackedAddresses(prev => new Set(Array.from(prev).concat([result.marketAddress])));
    // Reload markets to get the new one
    loadMarkets();
  };

  // Filter and search markets
  const filteredMarkets = markets
    .filter((market) => {
      if (filter === 'active') return isMarketActive(market);
      if (filter === 'resolved') return market.account.resolved;
      return true;
    })
    .filter((market) =>
      market.account.question.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice(0, 50); // Limit to 50 for performance

  const activeCount = markets.filter(m => isMarketActive(m)).length;
  const resolvedCount = markets.filter((m) => m.account.resolved).length;

  return (
    <div className="min-h-screen bg-poly-bg text-poly-text-main">
      <Navbar />

      <main className="pt-32 pb-16 px-4 relative z-10">
        <div className="max-w-[1440px] mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <h1 className="font-light tracking-tight text-5xl mb-3 text-white">Markets</h1>
              <p className="text-poly-text-muted text-sm flex items-center gap-2">
                Powered by{' '}
                <span className="inline-flex items-center gap-1.5 text-poly-green font-medium bg-poly-green/10 border border-poly-green/20 px-2.5 py-1 rounded-full shadow-[0_0_10px_rgba(43,168,89,0.1)]">
                  <Zap className="w-3.5 h-3.5" /> MagicBlock Rollups
                </span>
              </p>
            </div>

            <div className="flex items-center gap-4">
              <button
                className={`px-5 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl font-light hover:bg-white/10 transition-all duration-300 flex items-center gap-2 text-sm ${loading ? 'opacity-70 cursor-wait' : ''}`}
                onClick={loadMarkets}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                className="px-5 py-2.5 bg-poly-green text-black hover:bg-[#3dd176] rounded-xl font-medium transition-all duration-300 shadow-[0_0_15px_rgba(43,168,89,0.3)] hover:shadow-[0_0_25px_rgba(43,168,89,0.5)] flex items-center gap-2 text-sm"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="w-4 h-4" />
                Create Market
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Markets"
              value={markets.length.toLocaleString()}
            />
            <StatCard
              label="Active"
              value={activeCount.toLocaleString()}
            />
            <StatCard
              label="Resolved"
              value={resolvedCount.toLocaleString()}
            />
            <StatCard
              label="Network"
              value="Devnet"
              highlight
            />
          </div>

          {/* Search and Filter */}
          <div className="flex flex-col md:flex-row gap-4 mb-10">
            <div className="flex-1 relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-white/40 group-focus-within:text-poly-green transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search markets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 font-light focus:outline-none focus:border-poly-green/50 focus:ring-1 focus:ring-poly-green/50 transition-all shadow-inner"
              />
            </div>

            <div className="flex gap-2 p-1.5 bg-white/5 rounded-xl border border-white/10">
              {(['all', 'active', 'resolved'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`
                    px-6 py-2 rounded-lg text-sm font-light tracking-wide capitalize transition-all duration-300
                    ${
                      filter === f
                          ? 'bg-poly-green text-black shadow-[0_0_15px_rgba(43,168,89,0.3)]'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                    }
                  `}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-poly-red/10 border border-poly-red/20 rounded-lg p-4 mb-8">
              <p className="text-poly-red text-sm font-medium">{error}</p>
              <button onClick={loadMarkets} className="mt-2 text-xs font-semibold text-poly-red hover:underline">
                Try Again
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="bg-poly-panel border border-poly-border rounded-lg p-4 h-64 animate-pulse flex flex-col"
                >
                  <div className="h-4 bg-poly-border rounded w-16 mb-4" />
                  <div className="h-10 bg-poly-border rounded w-full mb-4 flex-1" />
                  <div className="h-16 bg-poly-border rounded w-full mt-auto" />
                </div>
              ))}
            </div>
          )}

          {/* Markets Grid */}
          {!loading && filteredMarkets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredMarkets.map((market) => (
                <MarketCard
                  key={market.publicKey}
                  market={market}
                  isTracked={trackedAddresses.has(market.publicKey)}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredMarkets.length === 0 && (
            <div className="text-center py-20 bg-poly-panel border border-poly-border rounded-lg">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-poly-border">
                 <Search className="w-6 h-6 text-poly-text-muted" />
              </div>
              <h3 className="font-semibold text-poly-text-main mb-1">
                No markets found
              </h3>
              <p className="text-sm text-poly-text-muted">
                {searchQuery
                  ? 'Try a different search term'
                  : 'No markets match the current filter'}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Create Market Modal */}
      <CreateMarketModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleMarketCreated}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 transition-all hover:bg-white/10 group">
      <div className="text-xs font-light text-white/60 tracking-widest uppercase mb-2">
        {label}
      </div>
      <p className={`font-light text-4xl tracking-tight ${highlight ? 'text-poly-green drop-shadow-[0_0_15px_rgba(43,168,89,0.5)]' : 'text-white'} group-hover:scale-105 origin-left transition-transform duration-300`}>
        {value}
      </p>
    </div>
  );
}
