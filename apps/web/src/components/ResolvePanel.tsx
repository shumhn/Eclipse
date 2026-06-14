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
    <div className="poly-card p-6 border-poly-blue/50 bg-poly-blue/5 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="w-5 h-5 text-poly-blue" />
        <h3 className="font-bold text-lg text-poly-text-main">Creator / Admin Controls</h3>
      </div>
      
      <p className="text-sm text-poly-text-muted mb-4">
        As an admin or oracle, you can resolve this market. This will finalize the outcome in the TEE and commit the result back to Solana L1.
      </p>

      {error && (
        <div className="mb-4 text-xs text-poly-red p-3 bg-poly-red/10 border border-poly-red/20 rounded-lg">
          {error}
        </div>
      )}

      {success ? (
        <div className="flex items-center gap-2 text-poly-green p-3 bg-poly-green/10 rounded-lg">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold text-sm">Market successfully resolved!</span>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => handleResolve('yes')}
            disabled={loading}
            className="flex-1 py-2.5 bg-poly-green hover:bg-[#23904C] text-white font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Resolve YES'}
          </button>
          <button
            onClick={() => handleResolve('no')}
            disabled={loading}
            className="flex-1 py-2.5 bg-poly-red hover:bg-[#C2323E] text-white font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Resolve NO'}
          </button>
        </div>
      )}
    </div>
  );
}
