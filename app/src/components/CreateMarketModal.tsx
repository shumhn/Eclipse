'use client';

import { useEffect, useState, useMemo } from 'react';
import { usePhantom, useAccounts, AddressType } from '@phantom/react-sdk';
import { PublicKey } from '@solana/web3.js';
import { X, Zap, AlertCircle, CheckCircle, CheckCircle2, CircleDashed, Loader2, Calendar, Clock, ExternalLink, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CreateMarketResult,
  explorerAccountUrl,
  explorerTxUrl,
  finalizeCreateMarket,
  prepareCreateMarket,
} from '@/lib/api';
import { signAndSend } from '@/lib/magicblock';
import { getOrFetchTeeAuthToken } from '@/lib/magicblock/client';
import { useMagicBlockLivePriceFeeds } from '@/hooks/useMagicBlockLivePriceFeeds';

import {
  DEFAULT_PRICE_FEED_SYMBOL,
  PRICE_FEED_BY_SYMBOL,
  formatUsdPrice,
  type PriceFeedSymbol,
} from '@/lib/priceFeeds';

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
  const [oracleAsset, setOracleAsset] = useState<PriceFeedSymbol>(DEFAULT_PRICE_FEED_SYMBOL);
  const [priceDirection, setPriceDirection] = useState<'above' | 'below'>('above');
  const [targetPriceUsd, setTargetPriceUsd] = useState('75');
  const [targetTouched, setTargetTouched] = useState(false);
  const [priceQuestion, setPriceQuestion] = useState('');
  const [priceQuestionTouched, setPriceQuestionTouched] = useState(false);
  const {
    feeds: livePriceFeeds,
    loading: feedsLoading,
    source: livePriceSource,
  } = useMagicBlockLivePriceFeeds(isOpen && oracleKind === 'pythPrice');

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

  const marketTitleDateTime = useMemo(() => {
    return selectedEndDateTime.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [selectedEndDateTime]);

  const marketTitleDate = useMemo(() => {
    return selectedEndDateTime.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedEndDateTime]);

  const selectedPriceFeed = useMemo(() => {
    return (
      livePriceFeeds.find((feed) => feed.symbol === oracleAsset) ||
      livePriceFeeds[0] || {
        ...PRICE_FEED_BY_SYMBOL[DEFAULT_PRICE_FEED_SYMBOL],
        currentPriceUsd: null,
        publishTime: null,
      }
    );
  }, [livePriceFeeds, oracleAsset]);

  const suggestedTargets = useMemo(() => {
    const current = selectedPriceFeed.currentPriceUsd;
    if (!current || current <= 0) return [];

    const multipliers =
      priceDirection === 'above'
        ? [1.01, 1.03, 1.05]
        : [0.99, 0.97, 0.95];

    return multipliers.map((multiplier) => {
      const value = roundTargetPrice(current * multiplier);
      const diff = Math.abs(multiplier - 1) * 100;
      return {
        value,
        label: `${priceDirection === 'above' ? '+' : '-'}${diff.toFixed(0)}%`,
      };
    });
  }, [priceDirection, selectedPriceFeed.currentPriceUsd]);

  useEffect(() => {
    if (targetTouched || !selectedPriceFeed.currentPriceUsd) return;

    const multiplier = priceDirection === 'above' ? 1.03 : 0.97;
    setTargetPriceUsd(roundTargetPrice(selectedPriceFeed.currentPriceUsd * multiplier));
  }, [priceDirection, selectedPriceFeed.currentPriceUsd, targetTouched]);

  const priceMarketQuestion = useMemo(() => {
    const direction = priceDirection === 'above' ? 'above' : 'below';
    const formattedTarget = Number(targetPriceUsd || 0).toLocaleString('en-US', {
      maximumFractionDigits: 2,
    });
    return `Will ${selectedPriceFeed.label} be ${direction} $${formattedTarget} on ${marketTitleDateTime}?`;
  }, [marketTitleDateTime, selectedPriceFeed.label, priceDirection, targetPriceUsd]);

  const priceQuestionSuggestions = useMemo(() => {
    const direction = priceDirection === 'above' ? 'above' : 'below';
    const directionVerb = priceDirection === 'above' ? 'hit' : 'fall below';
    const formattedTarget = Number(targetPriceUsd || 0).toLocaleString('en-US', {
      maximumFractionDigits: 2,
    });
    return [
      priceMarketQuestion,
      `Will ${selectedPriceFeed.baseAsset} ${directionVerb} $${formattedTarget} by ${marketTitleDate}?`,
      `${selectedPriceFeed.label} ${direction} $${formattedTarget} on ${marketTitleDate} — Yes or No?`,
    ];
  }, [
    marketTitleDate,
    priceDirection,
    priceMarketQuestion,
    selectedPriceFeed.baseAsset,
    selectedPriceFeed.label,
    targetPriceUsd,
  ]);

  useEffect(() => {
    if (priceQuestionTouched) return;
    setPriceQuestion(priceMarketQuestion);
  }, [priceMarketQuestion, priceQuestionTouched]);

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
        question: oracleKind === 'pythPrice' ? priceQuestion.trim() || priceMarketQuestion : question,
        initialLiquidity: parseFloat(initialLiquidity) * 1_000_000, // Convert to units
        endTime: selectedEndTimeSeconds,
        useCustomOracle,
        oracleKind,
        oracleAsset,
        oracleFeed: oracleKind === 'pythPrice' ? selectedPriceFeed.magicBlockFeed : undefined,
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
    setOracleAsset(DEFAULT_PRICE_FEED_SYMBOL);
    setPriceDirection('above');
    setTargetPriceUsd('75');
    setTargetTouched(false);
    setPriceQuestion('');
    setPriceQuestionTouched(false);
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
      <div className="relative w-full max-w-xl mx-4 bg-[#0d0e10] border border-white/10 rounded-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0d0e10] sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-eclipse-green" />
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
              <div className="w-12 h-12 bg-eclipse-green/20 rounded-full flex items-center justify-center border border-eclipse-green/30">
                <CheckCircle className="w-6 h-6 text-eclipse-green" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Market Created!</h3>
                <p className="text-sm text-gray-400">Your market is now live on devnet</p>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/10 rounded-sm p-4 mb-4">
              <p className="font-medium mb-2 line-clamp-2 text-white">{success.question}</p>
              <div className="text-sm text-gray-400 space-y-1">
                <p>
                  <span className="font-medium text-gray-300">Address:</span>{' '}
                  <a
                    href={explorerAccountUrl(success.marketAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-1 py-0.5 hover:text-white hover:underline border border-white/5"
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
                    ? `MagicBlock Pyth ${
                        success.oracleAsset
                          ? PRICE_FEED_BY_SYMBOL[success.oracleAsset]?.label || success.oracleAsset
                          : 'price feed'
                      }`
                    : 'Protocol Oracle'}
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="bg-gradient-to-b from-white/[0.04] to-transparent p-4 border-b border-white/[0.06]">
                <h3 className="font-bold text-white tracking-tight">Proof of Execution</h3>
                <p className="text-xs text-eclipse-text-muted mt-1">Honest devnet evidence for this market's creation</p>
              </div>
              <div className="p-4 space-y-3">
                <ProofLink label="Create market on Solana" signature={success.signature} />
                <ProofLink label="Delegate to MagicBlock TEE" signature={success.delegationSignature || undefined} />
                <ProofLink label="Delegate creator position" signature={success.creatorPositionDelegationSignature || undefined} />
                <ProofLink 
                  label="Initialize private market state" 
                  signature={success.privateStateInitializationSignature || undefined} 
                  isTee={true} 
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="heroSecondary" onClick={resetForm} className="flex-1 bg-white/[0.04] hover:bg-white/[0.08] text-white border-none">
                Create Another
              </Button>
              <Button onClick={handleClose} className="flex-1 bg-eclipse-green hover:bg-eclipse-green-light text-white">
                View Markets
              </Button>
            </div>
          </div>
        ) : loading ? (
          /* Loading State Card */
          <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
            <div className="w-full max-w-md bg-[#0d0e10]/80 rounded-xl border border-white/5 p-8 shadow-2xl">
              <div className="flex items-center justify-center mb-6">
                 <Loader2 className="w-10 h-10 animate-spin text-eclipse-green" />
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-6">Creating Market...</h3>
              <div className="space-y-4">
                {[
                  { id: 'prep', label: 'Preparing market transaction...' },
                  { id: 'sign', label: 'Waiting for wallet signature...' },
                  { id: 'create', label: 'Creating market on-chain...' },
                  ...(oracleKind === 'pythPrice' ? [
                    { id: 'delegate', label: 'Delegating to Ephemeral Rollup...' },
                    { id: 'finalize', label: 'Finalizing MagicBlock private state...' }
                  ] : [])
                ].map((step, index) => {
                  const isCurrent = loadingStep === step.label;
                  let isPast = false;
                  
                  const stepOrder = ['Preparing market transaction...', 'Waiting for wallet signature...', 'Creating market on-chain...', 'Delegating to Ephemeral Rollup...', 'Finalizing MagicBlock private state...'];
                  const currentIndex = stepOrder.indexOf(loadingStep || '');
                  const thisIndex = stepOrder.indexOf(step.label);
                  
                  if (currentIndex > thisIndex) isPast = true;

                  return (
                    <div key={step.id} className="flex items-center gap-4 text-sm">
                      {isPast ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-eclipse-green/20 text-eclipse-green">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                      ) : isCurrent ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-eclipse-green/30 border-t-eclipse-green animate-spin"></div>
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-white/30 text-[11px]">
                          {index + 1}
                        </div>
                      )}
                      <span className={`${isCurrent ? 'text-eclipse-green font-medium' : isPast ? 'text-gray-300' : 'text-gray-500'}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
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
                className="w-full p-3 bg-white/[0.04] border border-white/10 rounded-sm resize-none
                  focus:outline-none focus:border-eclipse-green focus:ring-1 focus:ring-eclipse-green
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
                    className="w-full p-3 bg-white/[0.04] border border-white/10 rounded-sm
                      focus:outline-none focus:border-eclipse-green focus:ring-1 focus:ring-eclipse-green
                      transition-all text-white [color-scheme:dark]"
                    required
                  />
                </div>
                <div className="relative">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full p-3 bg-white/[0.04] border border-white/10 rounded-sm
                      focus:outline-none focus:border-eclipse-green focus:ring-1 focus:ring-eclipse-green
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
                  className="w-full p-3 pr-20 bg-white/[0.04] border border-white/10 rounded-sm
                    focus:outline-none focus:border-eclipse-green focus:ring-1 focus:ring-eclipse-green
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
            <div className="space-y-3 rounded-sm border border-white/10 bg-white/[0.02] p-4">
              <label className="block font-medium text-gray-200">Resolution Source</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOracleKind('pythPrice')}
                  className={`rounded-sm border p-3 text-center text-sm font-medium transition-all ${
                    oracleKind === 'pythPrice' 
                      ? 'bg-eclipse-green/20 border-eclipse-green/50 text-eclipse-green' 
                      : 'bg-white/[0.04] border-white/10 text-gray-400 hover:bg-white/[0.08] hover:text-gray-200'
                  }`}
                >
                  MagicBlock Pyth
                </button>
                <button
                  type="button"
                  onClick={() => setOracleKind('manual')}
                  className={`rounded-sm border p-3 text-center text-sm font-medium transition-all ${
                    oracleKind === 'manual' 
                      ? 'bg-eclipse-green/20 border-eclipse-green/50 text-eclipse-green' 
                      : 'bg-white/[0.04] border-white/10 text-gray-400 hover:bg-white/[0.08] hover:text-gray-200'
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
                      onChange={(e) => {
                        setOracleAsset(e.target.value as PriceFeedSymbol);
                        setTargetTouched(false);
                        setPriceQuestionTouched(false);
                      }}
                      className="rounded-sm border border-white/10 bg-[#0d0e10] p-3 font-medium text-white focus:outline-none focus:border-eclipse-green"
                    >
                      {livePriceFeeds.map((feed) => (
                        <option key={feed.symbol} value={feed.symbol}>
                          {feed.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={priceDirection}
                      onChange={(e) => {
                        setPriceDirection(e.target.value as 'above' | 'below');
                        setTargetTouched(false);
                        setPriceQuestionTouched(false);
                      }}
                      className="rounded-sm border border-white/10 bg-[#0d0e10] p-3 font-medium text-white focus:outline-none focus:border-eclipse-green"
                    >
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                    </select>
                    <input
                      type="number"
                      value={targetPriceUsd}
                      onChange={(e) => {
                        setTargetPriceUsd(e.target.value);
                        setTargetTouched(true);
                      }}
                      className="rounded-sm border border-white/10 bg-[#0d0e10] p-3 text-white focus:outline-none focus:border-eclipse-green placeholder:text-gray-600"
                      min="0"
                      step="0.01"
                      placeholder="USD target"
                    />
                  </div>
                  <div className="rounded-sm border border-white/10 bg-[#0d0e10]/80 p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-400">Live {selectedPriceFeed.label}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-eclipse-green/70">
                          {livePriceSource === 'magicblock'
                            ? 'MagicBlock stream'
                            : livePriceSource === 'hermes'
                              ? 'Hermes fallback'
                              : 'Connecting live feed'}
                        </span>
                      </div>
                      <span className="font-semibold text-white">
                        {feedsLoading && !selectedPriceFeed.currentPriceUsd
                          ? 'Loading...'
                          : formatUsdPrice(selectedPriceFeed.currentPriceUsd)}
                      </span>
                    </div>
                    {suggestedTargets.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {suggestedTargets.map((target) => (
                          <button
                            key={target.label}
                            type="button"
                            onClick={() => {
                              setTargetPriceUsd(target.value);
                              setTargetTouched(true);
                            }}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-eclipse-green/50 hover:text-eclipse-green"
                          >
                            {target.label} · {formatUsdPrice(Number(target.value))}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">
                      Market Question
                    </label>
                    <textarea
                      value={priceQuestion}
                      onChange={(e) => {
                        setPriceQuestion(e.target.value);
                        setPriceQuestionTouched(true);
                      }}
                      className="w-full resize-none rounded-sm border border-white/10 bg-[#0d0e10] p-3 text-sm text-white transition-all placeholder:text-gray-600 focus:border-eclipse-green focus:outline-none focus:ring-1 focus:ring-eclipse-green"
                      rows={2}
                      minLength={10}
                      placeholder={priceMarketQuestion}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {priceQuestionSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            setPriceQuestion(suggestion);
                            setPriceQuestionTouched(true);
                          }}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-left text-xs text-gray-300 transition-colors hover:border-eclipse-green/50 hover:text-eclipse-green"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      You can edit the title; settlement still follows this asset, target, and resolution time.
                    </p>
                  </div>
                  <div className="rounded-sm border border-eclipse-green/20 bg-eclipse-green/10 p-3 text-sm">
                    <p className="font-medium text-eclipse-green">{priceQuestion || priceMarketQuestion}</p>
                    <p className="mt-1 text-xs text-eclipse-green/60">
                      Uses live MagicBlock/Pyth feed ({selectedPriceFeed.magicBlockFeed.slice(0, 6)}...
                      {selectedPriceFeed.magicBlockFeed.slice(-4)}). Contract target: {rawTargetPrice}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-400 mt-4">
                  <Zap className="w-4 h-4 text-eclipse-green" />
                  <span>Uses the configured <strong className="text-gray-200">protocol oracle</strong> for manual resolution.</span>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-sm text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <div className="pt-2">
              <Button
                type="submit"
                className="w-full bg-eclipse-green hover:bg-eclipse-green text-white font-medium rounded-sm py-6 border-none shadow-lg shadow-eclipse-green/20 transition-all hover:scale-[1.02]"
                disabled={
                  !isEndTimeInFuture ||
                  (oracleKind === 'manual' && question.length < 10) ||
                  (oracleKind === 'pythPrice' &&
                    (Number(targetPriceUsd || 0) <= 0 ||
                      (priceQuestion.trim() || priceMarketQuestion).length < 10))
                }
              >
                <Zap className="w-5 h-5 mr-2" />
                Create Market
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

function ProofLink({ label, signature, isTee, onViewReceipt, isLoadingReceipt }: { label: string; signature?: string; isTee?: boolean; onViewReceipt?: () => void; isLoadingReceipt?: boolean }) {
  if (!signature) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
        <div className="flex items-center gap-3">
          <CircleDashed className="h-4 w-4 text-eclipse-text-muted/50" />
          <span className="text-eclipse-text-muted/70">{label}</span>
        </div>
        <span className="font-medium text-eclipse-text-muted/40 text-xs">Pending</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-eclipse-green/20 bg-eclipse-green/5 p-3 text-sm">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4 text-eclipse-green drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
        <span className="font-medium text-white/90">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {isTee ? (
          <>

            <a
              href={`https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-eclipse-green hover:text-eclipse-green-light transition-colors text-xs bg-eclipse-green/10 px-2 py-1 rounded-md hover:bg-eclipse-green/20"
            >
              View tx
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        ) : (
          <a
            href={explorerTxUrl(signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-eclipse-green hover:text-eclipse-green-light transition-colors text-xs bg-eclipse-green/10 px-2 py-1 rounded-md hover:bg-eclipse-green/20"
          >
            View tx
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
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

function roundTargetPrice(value: number): string {
  if (value >= 1000) return Math.round(value).toString();
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}
