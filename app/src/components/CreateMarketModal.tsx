'use client';

import { useState, useMemo } from 'react';
import { usePhantom, useAccounts, AddressType } from '@phantom/react-sdk';
import { X, Zap, AlertCircle, CheckCircle, Loader2, Calendar, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateMarketResult, explorerAccountUrl, explorerTxUrl, finalizeCreateMarket, prepareCreateMarket } from '@/lib/api';
import { signAndSend } from '@/lib/magicblock';

interface CreateMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: CreateMarketResult) => void;
}

export default function CreateMarketModal({ isOpen, onClose, onSuccess }: CreateMarketModalProps) {
  const { isConnected } = usePhantom();
  const accounts = useAccounts();
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

  const [oracleKind, setOracleKind] = useState<'pythPrice' | 'manual'>('pythPrice');
  const [oracleAsset, setOracleAsset] = useState<'SOLUSD' | 'BTCUSD'>('SOLUSD');
  const [priceDirection, setPriceDirection] = useState<'above' | 'below'>('above');
  const [targetPriceUsd, setTargetPriceUsd] = useState('75');

  // Manual markets still use the configured protocol oracle for demo fallback.
  const [useCustomOracle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateMarketResult | null>(null);

  const solanaAccount = accounts?.find((a) => a.addressType === AddressType.solana);
  const walletAddress = solanaAccount?.address || '';

  const selectedEndDateTime = useMemo(() => new Date(`${endDate}T${endTime}`), [endDate, endTime]);

  const selectedEndTimeSeconds = useMemo(() => {
    return Math.floor(selectedEndDateTime.getTime() / 1000);
  }, [selectedEndDateTime]);

  const timeUntilResolution = useMemo(() => {
    const diffMs = selectedEndDateTime.getTime() - Date.now();
    return formatRelativeDuration(diffMs);
  }, [selectedEndDateTime]);

  const browserTimeZone = useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local timezone';
  }, []);

  const isEndTimeInFuture = useMemo(() => {
    return selectedEndDateTime.getTime() > Date.now();
  }, [selectedEndDateTime]);

  // Kept only for copy/backward compatibility; creation uses exact Unix seconds.
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
    return selectedEndDateTime.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [selectedEndDateTime]);

  const priceMarketQuestion = useMemo(() => {
    const asset = oracleAsset === 'BTCUSD' ? 'BTC/USD' : 'SOL/USD';
    const direction = priceDirection === 'above' ? 'above' : 'below';
    const formattedTarget = Number(targetPriceUsd || 0).toLocaleString('en-US', {
      maximumFractionDigits: 2,
    });
    return `Will ${asset} be ${direction} $${formattedTarget} at resolution?`;
  }, [oracleAsset, priceDirection, targetPriceUsd]);

  const rawTargetPrice = useMemo(() => {
    const usd = Number(targetPriceUsd || 0);
    if (!Number.isFinite(usd) || usd < 0) return '0';
    return Math.round(usd * 100_000_000).toString();
  }, [targetPriceUsd]);

  // Early return AFTER all hooks are called
  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Validate end time is in the future
    if (!isEndTimeInFuture) {
      setError('Resolution date must be in the future');
      setLoading(false);
      return;
    }

    try {
      const phantom = (window as any).phantom?.solana;
      if (!isConnected || !walletAddress || !phantom?.signTransaction) {
        throw new Error('Connect your Phantom Solana wallet before creating a market.');
      }

      const createParams = {
        question: oracleKind === 'pythPrice' ? priceMarketQuestion : question,
        initialLiquidity: parseFloat(initialLiquidity) * 1_000_000, // Convert to units
        endTime: selectedEndTimeSeconds,
        useCustomOracle,
        oracleKind,
        oracleAsset,
        priceDirection,
        targetPrice: rawTargetPrice,
        collateralMint: undefined, // Default backend collateral
        walletAddress,
      };

      setLoadingStep('Preparing market transaction...');
      const prepared = await prepareCreateMarket(createParams);

      setLoadingStep('Waiting for wallet signature...');
      const createSignature = await signAndSend(
        prepared.transaction,
        (tx) => phantom.signTransaction(tx),
        { sendTo: prepared.sendTo }
      );

      setLoadingStep('Finalizing MagicBlock private state...');
      const result = await finalizeCreateMarket({
        ...createParams,
        marketAddress: prepared.marketAddress,
        createSignature,
        collateralMint: prepared.collateralMint,
      });

      setSuccess(result);
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create market');
    } finally {
      setLoading(false);
      setLoadingStep(null);
    }
  };

  const resetForm = () => {
    setQuestion('');
    setInitialLiquidity('1');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEndDate(tomorrow.toISOString().split('T')[0]);
    setEndTime('12:00');
    setOracleKind('pythPrice');
    setOracleAsset('SOLUSD');
    setPriceDirection('above');
    setTargetPriceUsd('75');
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
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-900 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald-500" />
            <h2 className="font-bold text-xl">Create Market</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Success State */}
        {success ? (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
                <CheckCircle className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Market Created!</h3>
                <p className="text-sm text-gray-400">Your market is now live on devnet</p>
              </div>
            </div>

            <div className="bg-zinc-800/50 border border-white/10 rounded-xl p-4 mb-4">
              <p className="font-medium mb-2 line-clamp-2 text-white">{success.question}</p>
              <div className="text-sm text-gray-400 space-y-1">
                <p>
                  <span className="font-medium text-gray-300">Address:</span>{' '}
                  <a
                    href={explorerAccountUrl(success.marketAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1 py-0.5 hover:text-white hover:underline border border-white/5"
                  >
                    <code>{success.marketAddress.slice(0, 20)}...</code>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                <p>
                  <span className="font-medium text-gray-300">Resolves:</span>{' '}
                  {new Date(success.endTime).toLocaleString()}
                </p>
                <p>
                  <span className="font-medium text-gray-300">Oracle:</span>{' '}
                  {success.oracleKind === 'pythPrice'
                    ? `MagicBlock Pyth ${success.oracleAsset === 'BTCUSD' ? 'BTC/USD' : 'SOL/USD'}`
                    : 'Protocol Oracle'}
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
              <p className="font-medium text-emerald-400">Real devnet proof</p>
              <div className="mt-3 space-y-2">
                <ProofLink label="Create market" signature={success.signature} />
                <ProofLink label="Delegate market" signature={success.delegationSignature || undefined} />
                <ProofLink label="Delegate creator position" signature={success.creatorPositionDelegationSignature || undefined} />
                <ProofLink label="Initialize private market state" signature={success.privateStateInitializationSignature || undefined} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="heroSecondary" onClick={resetForm} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white border-none">
                Create Another
              </Button>
              <Button onClick={handleClose} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white">
                View Markets
              </Button>
            </div>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Question */}
            <div className={oracleKind === 'pythPrice' ? 'hidden' : ''}>
              <label className="block font-medium mb-2 text-gray-200">Market Question</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Will Bitcoin reach $100,000 by end of 2026?"
                className="w-full p-3 bg-zinc-800 border border-white/10 rounded-xl resize-none
                  focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500
                  transition-all text-white placeholder:text-gray-600"
                rows={3}
                required={oracleKind === 'manual'}
                minLength={oracleKind === 'manual' ? 10 : undefined}
              />
              <p className="text-sm text-gray-500 mt-1">Minimum 10 characters</p>
            </div>

            {/* Resolution Date & Time */}
            <div>
              <label className="block font-medium mb-2 text-gray-200">
                <Calendar className="w-4 h-4 inline mr-2 text-gray-400" />
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
                    className="w-full p-3 bg-zinc-800 border border-white/10 rounded-xl
                      focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500
                      transition-all text-white [color-scheme:dark]"
                    required
                  />
                </div>
                <div className="relative">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full p-3 bg-zinc-800 border border-white/10 rounded-xl
                      focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500
                      transition-all text-white [color-scheme:dark]"
                    required
                  />
                </div>
              </div>
              <p className="text-sm text-gray-400 mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3 text-gray-500" />
                Resolves: <span className="text-gray-300">{endDateTimeDisplay}</span> ({timeUntilResolution})
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Time is read from your browser timezone: {browserTimeZone}
              </p>
            </div>

            {/* Initial Liquidity */}
            <div>
              <label className="block font-medium mb-2 text-gray-200">
                Initial Liquidity (USDC)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={initialLiquidity}
                  onChange={(e) => setInitialLiquidity(e.target.value)}
                  min="1"
                  step="0.1"
                  className="w-full p-3 pr-20 bg-zinc-800 border border-white/10 rounded-xl
                    focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500
                    transition-all text-white"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-medium text-gray-500">
                  USDC
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Uses Devnet USDC (4zMMC...ncDU). Minimum 1 USDC required.
              </p>
            </div>

            {/* Oracle Type */}
            <div className="space-y-3 rounded-xl border border-white/10 bg-zinc-800/50 p-4">
              <label className="block font-medium text-gray-200">Resolution Source</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOracleKind('pythPrice')}
                  className={`rounded-xl border p-3 text-center text-sm font-medium transition-all ${
                    oracleKind === 'pythPrice' 
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                      : 'bg-zinc-800 border-white/10 text-gray-400 hover:bg-zinc-700 hover:text-gray-200'
                  }`}
                >
                  MagicBlock Pyth
                </button>
                <button
                  type="button"
                  onClick={() => setOracleKind('manual')}
                  className={`rounded-xl border p-3 text-center text-sm font-medium transition-all ${
                    oracleKind === 'manual' 
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                      : 'bg-zinc-800 border-white/10 text-gray-400 hover:bg-zinc-700 hover:text-gray-200'
                  }`}
                >
                  Manual Oracle
                </button>
              </div>

              {oracleKind === 'pythPrice' ? (
                <div className="space-y-3 mt-4">
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={oracleAsset}
                      onChange={(e) => setOracleAsset(e.target.value as 'SOLUSD' | 'BTCUSD')}
                      className="rounded-xl border border-white/10 bg-zinc-900 p-3 font-medium text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="SOLUSD">SOL/USD</option>
                      <option value="BTCUSD">BTC/USD</option>
                    </select>
                    <select
                      value={priceDirection}
                      onChange={(e) => setPriceDirection(e.target.value as 'above' | 'below')}
                      className="rounded-xl border border-white/10 bg-zinc-900 p-3 font-medium text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                    </select>
                    <input
                      type="number"
                      value={targetPriceUsd}
                      onChange={(e) => setTargetPriceUsd(e.target.value)}
                      className="rounded-xl border border-white/10 bg-zinc-900 p-3 text-white focus:outline-none focus:border-emerald-500 placeholder:text-gray-600"
                      min="0"
                      step="0.01"
                      placeholder="USD target"
                    />
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm">
                    <p className="font-medium text-emerald-400">{priceMarketQuestion}</p>
                    <p className="mt-1 text-xs text-emerald-500/60">
                      Uses live MagicBlock/Pyth feed. Contract target: {rawTargetPrice}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-400 mt-4">
                  <Zap className="w-4 h-4 text-emerald-500" />
                  <span>Uses the configured <strong className="text-gray-200">protocol oracle</strong> for manual resolution.</span>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <div className="pt-2">
              <Button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-medium rounded-xl py-6 border-none shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02]"
                disabled={
                  loading ||
                !isEndTimeInFuture ||
                  (oracleKind === 'manual' && question.length < 10) ||
                  (oracleKind === 'pythPrice' && Number(targetPriceUsd || 0) <= 0)
                }
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    {loadingStep || 'Creating on Devnet...'}
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Create Market
                  </>
                )}
              </Button>
            </div>

            <p className="text-center text-sm text-gray-500 pt-2">
              Creates a real MagicBlock private price market on Solana devnet
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
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-emerald-500/80">{label}</span>
        <span className="font-medium text-emerald-500/50">Pending</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-emerald-300">{label}</span>
      <a
        href={explorerTxUrl(signature)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        View tx
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function formatRelativeDuration(diffMs: number): string {
  if (diffMs <= 0) return 'ready to resolve';

  const totalSeconds = Math.ceil(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    const hourText = hours > 0 ? ` ${hours}h` : '';
    return `${days}d${hourText} from now`;
  }

  if (hours > 0) {
    const minuteText = minutes > 0 ? ` ${minutes}m` : '';
    return `${hours}h${minuteText} from now`;
  }

  if (minutes > 0) {
    const secondText = seconds > 0 ? ` ${seconds}s` : '';
    return `${minutes}m${secondText} from now`;
  }

  return `${seconds}s from now`;
}
