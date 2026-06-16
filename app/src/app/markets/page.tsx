'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle, CalendarClock, ChevronDown, Clock3, Plus, RefreshCw, Search, Zap, Shield, Layers } from 'lucide-react';
import Navbar from '@/components/Navbar';
import MarketCard from '@/components/MarketCard';
import CreateMarketModal from '@/components/CreateMarketModal';
import CryptoIcon from '@/components/CryptoIcon';
import { fetchMarkets, fetchTrackedMarkets, Market, isMarketActive, CreateMarketResult } from '@/lib/api';

type FilterType = 'all' | 'active' | 'resolved';
type AssetFilter = 'all' | 'BTC' | 'ETH' | 'SOL' | 'JUP' | 'DOGE' | 'OTHER';


const assetFilters: Array<{ label: AssetFilter; display: string }> = [
  { label: 'BTC', display: 'BTC' },
  { label: 'ETH', display: 'ETH' },
  { label: 'SOL', display: 'SOL' },
  { label: 'JUP', display: 'JUP' },
  { label: 'DOGE', display: 'DOGE' },
  { label: 'OTHER', display: 'Others' },
];

function MarketsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [markets, setMarkets] = useState<Market[]>([]);
  const [trackedAddresses, setTrackedAddresses] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams?.get('q') || '');
  const [filter, setFilter] = useState<FilterType>('active');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allData, trackedData] = await Promise.all([
        fetchMarkets(),
        fetchTrackedMarkets().catch(() => null),
      ]);
      
      const validMarkets = allData.filter(m => !m.account.question.toLowerCase().includes('smoke'));
      setMarkets(validMarkets);

      if (trackedData?.markets) {
        setTrackedAddresses(new Set(trackedData.markets.map((m) => m.publicKey)));
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

  useEffect(() => {
    const q = searchParams?.get('q');
    if (q !== null && q !== undefined) {
      setSearchQuery(q);
    }
  }, [searchParams]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    const newParams = new URLSearchParams(searchParams?.toString() || '');
    if (val) {
      newParams.set('q', val);
    } else {
      newParams.delete('q');
    }
    router.push(`/markets?${newParams.toString()}`);
  };

  const handleMarketCreated = (result: CreateMarketResult) => {
    setTrackedAddresses((prev) => new Set(Array.from(prev).concat([result.marketAddress])));
    loadMarkets();
  };

  const assetCounts = useMemo(() => {
    const counts: Record<AssetFilter, number> = {
      all: markets.length,
      BTC: 0,
      ETH: 0,
      SOL: 0,
      JUP: 0,
      DOGE: 0,
      OTHER: 0,
    };

    for (const market of markets) {
      const asset = getMarketAsset(market);
      if (asset in counts && asset !== 'OTHER') {
        counts[asset as AssetFilter] += 1;
      } else {
        counts.OTHER += 1;
      }
    }

    return counts;
  }, [markets]);

  const filteredMarkets = markets
    .filter((market) => {
      if (filter === 'active') return isMarketActive(market);
      if (filter === 'resolved') return market.account.resolved;
      return true;
    })
    .filter((market) => {
      if (assetFilter === 'all') return true;
      return getMarketAsset(market) === assetFilter;
    })
    .filter((market) =>
      market.account.question.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice(0, 50);

  const activeCount = markets.filter((market) => isMarketActive(market)).length;
  const resolvedCount = markets.filter((market) => market.account.resolved).length;

  return (
    <div className="min-h-screen bg-eclipse-bg text-eclipse-text-main">
      <Navbar />

      <main className="relative z-10 border-t border-eclipse-border/70 pt-24">
        <div className="mx-auto grid max-w-[1560px] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden min-h-[calc(100vh-6rem)] border-r border-eclipse-border/80 px-8 py-8 lg:block">
            <MarketSidebar
              filter={filter}
              setFilter={setFilter}
              assetFilter={assetFilter}
              setAssetFilter={setAssetFilter}
              assetCounts={assetCounts}
              activeCount={activeCount}
              resolvedCount={resolvedCount}
            />
          </aside>

          <section className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#f2f4f7] flex items-center gap-3">
                  Predictions
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-eclipse-green/20 bg-eclipse-green/10 px-2.5 py-0.5 text-[11px] font-bold text-eclipse-green uppercase tracking-wider">
                    <Shield className="h-3 w-3" aria-hidden="true" />
                    Private
                  </span>
                </h1>
                <div className="mt-2 flex items-center gap-2 text-[13px] text-eclipse-text-muted">
                  <span>Powered by</span>
                  <img src="/magicblock-logo.svg" alt="MagicBlock" className="h-3.5 opacity-90" />
                  <span>for zero MEV & absolute privacy.</span>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block sm:w-80">
                  <span className="sr-only">Search markets</span>
                  <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search markets..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full sm:w-64 pl-10 pr-4 py-2 bg-[#101216] border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] focus:outline-none focus:border-eclipse-green/60 focus:ring-1 focus:ring-eclipse-green/40 transition-colors"
                />
              </div>  </label>

                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-eclipse-border bg-[#101216] px-4 text-sm font-semibold text-eclipse-text-main hover:border-eclipse-green/50 hover:bg-[#15181d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green"
                  onClick={loadMarkets}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  Refresh
                </button>

                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-eclipse-green px-5 text-sm font-bold text-black hover:bg-eclipse-green-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green"
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create
                </button>
              </div>
            </div>

            <div className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {(['all', 'active', 'resolved'] as FilterType[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`h-10 rounded-full border px-4 text-sm font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green ${
                    filter === item
                      ? 'border-eclipse-green bg-eclipse-green text-black'
                      : 'border-eclipse-border bg-[#101216] text-eclipse-text-muted'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-eclipse-red/30 bg-eclipse-red/10 p-4 text-sm text-eclipse-red">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{error}</p>
                  <button onClick={loadMarkets} className="mt-2 font-bold underline underline-offset-4">
                    Try again
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={index}
                    className="min-h-64 animate-pulse rounded-2xl border border-eclipse-border bg-[#101216] p-5"
                  >
                    <div className="mb-5 h-8 w-28 rounded-full bg-white/10" />
                    <div className="mb-6 h-6 w-2/3 rounded bg-white/10" />
                    <div className="mb-5 h-12 rounded bg-white/10" />
                    <div className="h-12 rounded bg-white/10" />
                  </div>
                ))}
              </div>
            )}

            {!loading && filteredMarkets.length > 0 && (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {filteredMarkets.map((market) => (
                  <MarketCard
                    key={market.publicKey}
                    market={market}
                    isTracked={trackedAddresses.has(market.publicKey)}
                  />
                ))}
              </div>
            )}

            {!loading && filteredMarkets.length === 0 && (
              <div className="rounded-2xl border border-eclipse-border bg-[#101216] px-6 py-16 text-center">
                <Search className="mx-auto mb-4 h-9 w-9 text-eclipse-text-muted" aria-hidden="true" />
                <h3 className="text-lg font-bold text-white">No predictions found</h3>
                <p className="mt-2 text-sm text-eclipse-text-muted">
                  Try another asset, status, or search query.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      <CreateMarketModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleMarketCreated}
      />
    </div>
  );
}

function MarketSidebar({
  filter,
  setFilter,
  assetFilter,
  setAssetFilter,
  assetCounts,
  activeCount,
  resolvedCount,
}: {
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
  assetFilter: AssetFilter;
  setAssetFilter: (filter: AssetFilter) => void;
  assetCounts: Record<AssetFilter, number>;
  activeCount: number;
  resolvedCount: number;
}) {
  return (
    <div className="sticky top-32 space-y-8 pt-6">      <div className="space-y-3" aria-label="Asset filters">
        <SidebarAssetButton
          active={assetFilter === 'all'}
          asset="ALL"
          label="All Markets"
          count={assetCounts.all}
          onClick={() => setAssetFilter('all')}
        />
        {assetFilters.map((item) => (
          <SidebarAssetButton
            key={item.label}
            active={assetFilter === item.label}
            asset={item.label}
            label={item.display}
            count={assetCounts[item.label]}
            onClick={() => setAssetFilter(item.label)}
          />
        ))}
      </div>

      <div className="space-y-2 border-t border-eclipse-border pt-7" aria-label="Status filters">
        <SidebarStatusButton
          active={filter === 'all'}
          icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
          label="All"
          count={assetCounts.all}
          onClick={() => setFilter('all')}
        />
        <SidebarStatusButton
          active={filter === 'active'}
          icon={<Clock3 className="h-4 w-4" aria-hidden="true" />}
          label="Active"
          count={activeCount}
          onClick={() => setFilter('active')}
        />
        <SidebarStatusButton
          active={filter === 'resolved'}
          icon={<Zap className="h-4 w-4" aria-hidden="true" />}
          label="Resolved"
          count={resolvedCount}
          onClick={() => setFilter('resolved')}
        />
      </div>
    </div>
  );
}

function SidebarAssetButton({
  active,
  asset,
  label,
  count,
  onClick,
}: {
  active: boolean;
  asset: string;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green ${
        active ? 'bg-white/[0.08] text-white' : 'text-[#c8cbd1] hover:bg-white/[0.04] hover:text-white'
      }`}
    >
      {asset === 'ALL' ? (
        <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-white/10 shadow-sm text-white">
          <Layers className="h-4 w-4" />
        </div>
      ) : (
        <CryptoIcon asset={asset} size={28} />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-eclipse-text-muted">({count})</span>
      <ChevronDown className="h-4 w-4 text-eclipse-text-muted" aria-hidden="true" />
    </button>
  );
}

function SidebarStatusButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green ${
        active ? 'bg-eclipse-green text-black' : 'text-eclipse-text-muted hover:bg-white/5 hover:text-white'
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      <span>{count}</span>
    </button>
  );
}

function getMarketAsset(market: Market): AssetFilter {
  const asset = market.priceMarket?.asset?.toUpperCase() || '';
  if (asset.includes('BTC')) return 'BTC';
  if (asset.includes('ETH')) return 'ETH';
  if (asset.includes('SOL')) return 'SOL';
  if (asset.includes('JUP') || asset.includes('JUPITER')) return 'JUP';
  if (asset.includes('DOGE')) return 'DOGE';
  return 'OTHER';
}

export default function MarketsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#030608] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-eclipse-green border-t-transparent rounded-full" /></div>}>
      <MarketsContent />
    </Suspense>
  );
}
