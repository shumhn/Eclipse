'use client';

import { useState, useMemo } from 'react';
import { X, Zap, AlertCircle, CheckCircle, Loader2, Calendar, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createMarket, CreateMarketResult, explorerAccountUrl, explorerTxUrl } from '@/lib/api';

interface CreateMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: CreateMarketResult) => void;
}

export default function CreateMarketModal({ isOpen, onClose, onSuccess }: CreateMarketModalProps) {
  const [question, setQuestion] = useState('');
  const [initialLiquidity, setInitialLiquidity] = useState('1'); // In tokens (display)

  // Date and time state for resolution
  const [endDate, setEndDate] = useState(() => {
    // Default to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [endTime, setEndTime] = useState('12:00');

  // Default to the configured protocol oracle for the demo build
  const [useCustomOracle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateMarketResult | null>(null);

  // Calculate hours until end date/time - MUST be before any conditional returns
  const endTimeHours = useMemo(() => {
    const endDateTime = new Date(`${endDate}T${endTime}`);
    const now = new Date();
    const diffMs = endDateTime.getTime() - now.getTime();
    const diffHours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
    return diffHours;
  }, [endDate, endTime]);

  // Minimum date is today
  const minDate = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Maximum date is 1 year from now
  const maxDate = useMemo(() => {
    const max = new Date();
    max.setFullYear(max.getFullYear() + 1);
    return max.toISOString().split('T')[0];
  }, []);

  // Format display of end date/time
  const endDateTimeDisplay = useMemo(() => {
    const dt = new Date(`${endDate}T${endTime}`);
    return dt.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [endDate, endTime]);

  // Early return AFTER all hooks are called
  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Validate end time is in the future
    const endDateTime = new Date(`${endDate}T${endTime}`);
    if (endDateTime <= new Date()) {
      setError('Resolution date must be in the future');
      setLoading(false);
      return;
    }

    try {
      const result = await createMarket({
        question,
        initialLiquidity: parseFloat(initialLiquidity) * 1_000_000, // Convert to units
        endTimeHours,
        useCustomOracle,
        collateralMint: undefined, // Default backend collateral
      });
      setSuccess(result);
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create market');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setQuestion('');
    setInitialLiquidity('1');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEndDate(tomorrow.toISOString().split('T')[0]);
    setEndTime('12:00');
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-dark/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white border-4 border-dark rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-dark bg-emerald-50 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald-600" />
            <h2 className="font-black text-xl">Create Market</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-dark/10 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Success State */}
        {success ? (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-emerald-400 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Market Created!</h3>
                <p className="text-sm text-dark/60">Your market is now live on devnet</p>
              </div>
            </div>

            <div className="bg-gray-50 border-2 border-dark rounded-xl p-4 mb-4">
              <p className="font-medium mb-2 line-clamp-2">{success.question}</p>
              <div className="text-sm text-dark/60 space-y-1">
                <p>
                  <span className="font-bold">Address:</span>{' '}
                  <a
                    href={explorerAccountUrl(success.marketAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-white px-1 hover:underline"
                  >
                    <code>{success.marketAddress.slice(0, 20)}...</code>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                <p>
                  <span className="font-bold">Resolves:</span>{' '}
                  {new Date(success.endTime).toLocaleString()}
                </p>
                <p>
                  <span className="font-bold">Oracle:</span>{' '}
                  {success.isCustomOracle ? 'Custom Oracle' : 'Protocol Oracle'}
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-bold">Real devnet proof</p>
              <div className="mt-3 space-y-2">
                <ProofLink label="Create market" signature={success.signature} />
                <ProofLink label="Delegate market" signature={success.delegationSignature || undefined} />
                <ProofLink label="Delegate creator position" signature={success.creatorPositionDelegationSignature || undefined} />
                <ProofLink label="Initialize private market state" signature={success.privateStateInitializationSignature || undefined} />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="heroSecondary" onClick={resetForm} className="flex-1">
                Create Another
              </Button>
              <Button variant="hero" onClick={handleClose} className="flex-1">
                View Markets
              </Button>
            </div>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Question */}
            <div>
              <label className="block font-bold mb-2">Market Question</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Will Bitcoin reach $100,000 by end of 2026?"
                className="w-full p-3 border-2 border-dark rounded-xl resize-none
                  shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                  focus:outline-none focus:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]
                  focus:translate-x-[2px] focus:translate-y-[2px]
                  transition-all"
                rows={3}
                required
                minLength={10}
              />
              <p className="text-sm text-dark/50 mt-1">Minimum 10 characters</p>
            </div>

            {/* Resolution Date & Time */}
            <div>
              <label className="block font-bold mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Resolution Date & Time
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={minDate}
                    max={maxDate}
                    className="w-full p-3 border-2 border-dark rounded-xl
                      shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                      focus:outline-none focus:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]
                      focus:translate-x-[2px] focus:translate-y-[2px]
                      transition-all bg-white"
                    required
                  />
                </div>
                <div className="relative">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full p-3 border-2 border-dark rounded-xl
                      shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                      focus:outline-none focus:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]
                      focus:translate-x-[2px] focus:translate-y-[2px]
                      transition-all bg-white"
                    required
                  />
                </div>
              </div>
              <p className="text-sm text-dark/50 mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Resolves: {endDateTimeDisplay} ({endTimeHours} hours from now)
              </p>
            </div>

            {/* Initial Liquidity */}
            <div>
              <label className="block font-bold mb-2">
                Initial Liquidity (USDC)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={initialLiquidity}
                  onChange={(e) => setInitialLiquidity(e.target.value)}
                  min="1"
                  step="0.1"
                  className="w-full p-3 pr-20 border-2 border-dark rounded-xl
                    shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                    focus:outline-none focus:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]
                    focus:translate-x-[2px] focus:translate-y-[2px]
                    transition-all"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-dark/50">
                  USDC
                </span>
              </div>
              <p className="text-sm text-dark/50 mt-1">
                Uses Devnet USDC (Gh9Zw...GtKJr). Minimum 1 USDC required.
              </p>
            </div>

            {/* Oracle Type - Hidden for MVP, default to the configured protocol oracle */}
            <div className="bg-gray-50 border border-dark/20 rounded-xl p-3">
              <div className="flex items-center gap-2 text-sm text-dark/60">
                <Zap className="w-4 h-4" />
                <span>Using the configured <strong>protocol oracle</strong> for market resolution</span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border-2 border-red-300 rounded-xl text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              variant="hero"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
              disabled={loading || question.length < 10 || endTimeHours < 1}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Creating on Devnet...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2" />
                  Create Market
                </>
              )}
            </Button>

            <p className="text-center text-sm text-dark/50">
              Creates a real market shell on Solana devnet for the MagicBlock private flow
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function ProofLink({ label, signature }: { label: string; signature?: string }) {
  if (!signature) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-medium text-amber-700">Pending</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <a
        href={explorerTxUrl(signature)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium underline"
      >
        View tx
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
