'use client';

import { useState } from 'react';
import { ShieldAlert, CheckCircle } from 'lucide-react';
import { Market } from '@/lib/api';
import { resolveMarket } from '@/lib/trading';

interface ResolvePanelProps {
  market: Market;
  onResolveComplete?: () => void;
}

export default function ResolvePanel({ market, onResolveComplete }: ResolvePanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const isPriceMarket = market.account.oracle_kind === 'pythPrice';
  const isSportsMarket = Boolean(market.sportsMarket);

  if (market.account.resolved) {
    return null;
  }

  const handleResolve = async (outcome: 'yes' | 'no') => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await resolveMarket({
        marketAddress: market.publicKey,
        outcome,
      });

      setSuccess(true);
      onResolveComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve market');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="eclipse-card p-6 border-eclipse-blue/50 bg-eclipse-blue/5 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="w-5 h-5 text-eclipse-blue" />
        <h3 className="font-bold text-lg text-eclipse-text-main">
          {isPriceMarket ? 'Oracle Settlement' : 'Creator / Admin Controls'}
        </h3>
      </div>
      
      <p className="text-sm text-eclipse-text-muted mb-4">
        {isPriceMarket
          ? 'This price market resolves automatically after expiry. A crank watches MagicBlock/Pyth markets, reads the oracle price, and commits the final outcome back to Solana L1.'
          : isSportsMarket
            ? 'This sports market resolves through admin confirmation. Use the match context and rule below, then commit the final outcome back through MagicBlock.'
          : 'As an admin or oracle, you can resolve this market. This will finalize the outcome in the TEE and commit the result back to Solana L1.'}
      </p>

      {isSportsMarket && (
        <div className="mb-4 rounded-lg border border-yellow-400/20 bg-yellow-500/10 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-yellow-100">
              {market.sportsMarket?.homeTeam} vs {market.sportsMarket?.awayTeam}
            </span>
            <span className="rounded-full border border-yellow-400/20 px-2 py-1 text-[11px] uppercase tracking-wide text-yellow-100/70">
              {market.sportsMarket?.marketType?.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-yellow-100/70">
            {market.sportsMarket?.resolutionRule}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 text-xs text-eclipse-red p-3 bg-eclipse-red/10 border border-eclipse-red/20 rounded-lg">
          {error}
        </div>
      )}

      {success ? (
        <div className="flex items-center gap-2 text-eclipse-green p-3 bg-eclipse-green/10 rounded-lg">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold text-sm">Market successfully resolved!</span>
        </div>
      ) : isPriceMarket ? (
        <div className="rounded-lg border border-eclipse-border bg-[#14181C] p-4 text-sm text-eclipse-text-muted">
          {market.account.resolvable
            ? 'This market has reached its resolution time and is ready for the crank to settle it automatically.'
            : 'This market will auto-settle from the oracle once the resolution timestamp is reached.'}
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => handleResolve('yes')}
            disabled={loading}
            className="flex-1 py-2.5 bg-eclipse-green hover:bg-[#23904C] text-white font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Resolve YES'}
          </button>
          <button
            onClick={() => handleResolve('no')}
            disabled={loading}
            className="flex-1 py-2.5 bg-eclipse-red hover:bg-[#C2323E] text-white font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Resolve NO'}
          </button>
        </div>
      )}
    </div>
  );
}
