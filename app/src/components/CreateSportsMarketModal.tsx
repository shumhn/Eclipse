'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccounts, usePhantom, AddressType } from '@phantom/react-sdk';
import { AlertCircle, CalendarClock, CheckCircle, Loader2, Sparkles, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CreateMarketResult,
  explorerAccountUrl,
  finalizeCreateMarket,
  prepareCreateMarket,
} from '@/lib/api';
import { signAndSend } from '@/lib/magicblock';
import {
  createSportsMetadata,
  fetchWorldCupEvents,
  generateSportsMarketSuggestions,
  type SportsEvent,
  type SportsMarketSuggestion,
} from '@/lib/sports';

const MARKET_CREATION_FEE_USDC = 0.5;

interface CreateSportsMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: CreateMarketResult) => void;
}

export default function CreateSportsMarketModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateSportsMarketModalProps) {
  const { isConnected } = usePhantom();
  const accounts = useAccounts();
  const [events, setEvents] = useState<SportsEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [suggestions, setSuggestions] = useState<SportsMarketSuggestion[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<SportsMarketSuggestion | null>(null);
  const [initialLiquidity, setInitialLiquidity] = useState('1');
  const [endDateTime, setEndDateTime] = useState('');
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateMarketResult | null>(null);

  const solanaAccount = accounts?.find((account) => account.addressType === AddressType.solana);
  const walletAddress = solanaAccount?.address || '';

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || events[0],
    [events, selectedEventId]
  );

  const totalCreateCostUsdc = useMemo(() => {
    const liquidity = Number(initialLiquidity || 0);
    return (Number.isFinite(liquidity) ? liquidity : 0) + MARKET_CREATION_FEE_USDC;
  }, [initialLiquidity]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoadingEvents(true);
    fetchWorldCupEvents()
      .then((nextEvents) => {
        if (!active || nextEvents.length === 0) return;
        setEvents(nextEvents);
        setSelectedEventId(nextEvents[0].id);
      })
      .catch(() => {
        if (!active) return;
        setEvents([]);
        setSelectedEventId('');
      })
      .finally(() => {
        if (active) setLoadingEvents(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!selectedEvent) return;

    const defaultEnd = new Date(selectedEvent.startTime);
    defaultEnd.setHours(defaultEnd.getHours() + 2);
    setEndDateTime(toLocalDateTimeValue(defaultEnd));
    setSuggestions([]);
    setSelectedSuggestion(null);
    setSelectedQuestion('');
    setAiError(null);

    let active = true;
    setLoadingAi(true);
    generateSportsMarketSuggestions(selectedEvent)
      .then((nextSuggestions) => {
        if (!active) return;
        setSuggestions(nextSuggestions);
        setSelectedSuggestion(nextSuggestions[0]);
        setSelectedQuestion(nextSuggestions[0]?.question || '');
      })
      .catch((err) => {
        if (!active) return;
        setAiError(err instanceof Error ? err.message : 'Gemini could not generate market suggestions');
      })
      .finally(() => {
        if (active) setLoadingAi(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEvent]);

  if (!isOpen) return null;

  const handleSuggestionClick = (suggestion: SportsMarketSuggestion) => {
    setSelectedSuggestion(suggestion);
    setSelectedQuestion(suggestion.question);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedEvent || !selectedSuggestion) {
      setError('Wait for a Gemini market suggestion first.');
      return;
    }

    const endTime = Math.floor(new Date(endDateTime).getTime() / 1000);
    if (!Number.isFinite(endTime) || endTime <= Math.floor(Date.now() / 1000)) {
      setError('Resolution time must be in the future.');
      return;
    }

    try {
      const phantom = (window as any).phantom?.solana;
      if (!isConnected || !walletAddress || !phantom?.signTransaction) {
        throw new Error('Connect your Phantom Solana wallet before creating a market.');
      }

      const sportsMarket = createSportsMetadata(
        selectedEvent,
        selectedSuggestion.marketType,
        selectedSuggestion.resolutionRule
      );
      const createParams = {
        question: selectedQuestion.trim(),
        initialLiquidity: Number(initialLiquidity || 0) * 1_000_000,
        endTime,
        oracleKind: 'manual' as const,
        useCustomOracle: false,
        sportsMarket,
        walletAddress,
      };

      if (createParams.question.length < 10) {
        setError('Question must be at least 10 characters.');
        return;
      }

      setSubmitting(true);
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
      setError(err instanceof Error ? err.message : 'Failed to create World Cup market');
    } finally {
      setSubmitting(false);
      setLoadingStep(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close sports market modal"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md border border-white/10 bg-[#0d0e10] text-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0d0e10] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-yellow-500/15 text-yellow-400">
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Create World Cup Market</h2>
              <p className="text-xs text-gray-500">Private sports market, powered by MagicBlock</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {success ? (
          <div className="space-y-5 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-eclipse-green/30 bg-eclipse-green/15">
                <CheckCircle className="h-6 w-6 text-eclipse-green" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-lg font-bold">World Cup market created</h3>
                <a
                  href={explorerAccountUrl(success.marketAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-eclipse-green hover:underline"
                >
                  View market account
                </a>
              </div>
            </div>
            <p className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-200">
              {success.question}
            </p>
            <Button type="button" onClick={onClose} className="w-full bg-eclipse-green text-black hover:bg-eclipse-green-light">
              View Markets
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 p-6" aria-busy={submitting}>
            <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-gray-200">Select Match</legend>
                <div className="grid gap-2">
                  {!loadingEvents && events.length === 0 && (
                    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">
                      No live or upcoming FIFA World Cup matches found right now.
                    </div>
                  )}
                  {events.map((sportsEvent) => {
                    const active = sportsEvent.id === selectedEventId;
                    return (
                      <button
                        key={sportsEvent.id}
                        type="button"
                        onClick={() => setSelectedEventId(sportsEvent.id)}
                        className={`rounded-md border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green ${
                          active
                            ? 'border-yellow-400/60 bg-yellow-500/10'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-white">{sportsEvent.title}</span>
                          <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide text-gray-400">
                            {sportsEvent.status}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatEventTime(sportsEvent.startTime)}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {loadingEvents && <p className="text-xs text-gray-500">Refreshing World Cup events...</p>}
              </fieldset>

              <div className="space-y-4 rounded-md border border-white/10 bg-white/[0.02] p-4">
                <div>
                  <label htmlFor="sports-liquidity" className="block text-sm font-semibold text-gray-200">
                    Initial Liquidity (USDC)
                  </label>
                  <input
                    id="sports-liquidity"
                    type="text"
                    inputMode="decimal"
                    value={initialLiquidity}
                    onChange={(event) => setInitialLiquidity(event.target.value)}
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-[#0d0e10] px-3 text-sm text-white focus:border-eclipse-green focus:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Public creation fee: {MARKET_CREATION_FEE_USDC.toFixed(2)} USDC. Total wallet charge:{' '}
                    {totalCreateCostUsdc.toFixed(2)} USDC.
                  </p>
                </div>

                <div>
                  <label htmlFor="sports-resolution-time" className="block text-sm font-semibold text-gray-200">
                    Resolution Time
                  </label>
                  <input
                    id="sports-resolution-time"
                    type="datetime-local"
                    value={endDateTime}
                    onChange={(event) => setEndDateTime(event.target.value)}
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-[#0d0e10] px-3 text-sm text-white [color-scheme:dark] focus:border-eclipse-green focus:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green"
                  />
                  <p className="mt-2 text-xs text-gray-500">Default is roughly two hours after kickoff.</p>
                </div>

                <div className="rounded-md border border-eclipse-green/20 bg-eclipse-green/10 p-3 text-xs text-eclipse-green">
                  Private trading stays inside MagicBlock. The sports result is admin-confirmed in v1.
                </div>
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                <Sparkles className="h-4 w-4 text-eclipse-green" aria-hidden="true" />
                AI Market Suggestions
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {!loadingAi && aiError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 sm:col-span-2">
                    {aiError}
                  </div>
                )}
                {!loadingAi && !aiError && suggestions.length === 0 && (
                  <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-gray-400 sm:col-span-2">
                    Gemini suggestions will appear here after the selected match loads.
                  </div>
                )}
                {suggestions.map((suggestion) => {
                  const active = selectedSuggestion?.question === suggestion.question;
                  return (
                    <button
                      key={suggestion.question}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={`rounded-md border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green ${
                        active
                          ? 'border-eclipse-green/60 bg-eclipse-green/10 text-white'
                          : 'border-white/10 bg-white/[0.03] text-gray-300 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {suggestion.question}
                    </button>
                  );
                })}
              </div>
              {loadingAi && <p className="text-xs text-gray-500">Gemini is drafting stronger questions...</p>}
            </fieldset>

            <div>
              <label htmlFor="sports-question" className="block text-sm font-semibold text-gray-200">
                Final Market Question
              </label>
              <textarea
                id="sports-question"
                value={selectedQuestion}
                onChange={(event) => setSelectedQuestion(event.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-md border border-white/10 bg-[#0d0e10] p-3 text-sm text-white focus:border-eclipse-green focus:outline-none focus-visible:ring-2 focus-visible:ring-eclipse-green"
                minLength={10}
              />
              <p className="mt-2 text-xs text-gray-500">{selectedSuggestion?.resolutionRule}</p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}

            {loadingStep && (
              <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-gray-300">
                {loadingStep}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || !selectedSuggestion || !selectedQuestion.trim()}
              className="h-12 w-full rounded-md bg-eclipse-green font-bold text-black hover:bg-eclipse-green-light disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Creating Sports Market...
                </>
              ) : (
                'Create World Cup Market'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function toLocalDateTimeValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatEventTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
