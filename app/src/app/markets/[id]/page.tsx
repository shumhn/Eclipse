"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccounts, AddressType } from "@phantom/react-sdk";
import { PublicKey } from "@solana/web3.js";
import {
  ArrowLeft,
  Clock,
  Users,
  ExternalLink,
  Shield,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import TradePanel from "@/components/TradePanel";
import ClaimPanel from "@/components/ClaimPanel";
import ResolvePanel from "@/components/ResolvePanel";
import PriceChart from "@/components/PriceChart";
import RulesSection from "@/components/RulesSection";
import MarketCountdown from "@/components/MarketCountdown";
import CryptoIcon from "@/components/CryptoIcon";
import { Button } from "@/components/ui/button";
import {
  calculatePriceFromReserves,
  fetchMarket,
  fetchPosition,
  Market,
  MarketPrices,
  MarketQuoteState,
  Position,
  formatUsdPrice,
  explorerTxUrl,
  formatTimestamp,
  getMarketTimeRemaining,
  isMarketActive,
} from "@/lib/api";
import { getOrFetchTeeAuthToken } from "@/lib/magicblock";

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const marketId = params.id as string;
  const accounts = useAccounts();
  const solanaAccount = accounts?.find((a) => a.addressType === AddressType.solana);
  const walletAddress = solanaAccount?.address || "";

  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [walletPosition, setWalletPosition] = useState<Position | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);

  const loadMarket = async () => {
    if (!marketId) return;

    try {
      const data = await fetchMarket(marketId);
      setMarket(data);
      setError(null);
    } catch (err) {
      // Only show error if we have no data at all
      if (!market) {
        setError(err instanceof Error ? err.message : "Failed to load market");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadWalletPosition = async () => {
    if (!marketId || !walletAddress) {
      setWalletPosition(null);
      return;
    }

    setPositionLoading(true);
    try {
      const signer = (window as any).phantom?.solana;
      const teeToken = signer?.signMessage
        ? await getOrFetchTeeAuthToken(
            new PublicKey(walletAddress),
            async (msg: Uint8Array) => (await signer.signMessage(msg, "utf8")).signature,
          )
        : undefined;

      const nextPosition = await fetchPosition({
        marketAddress: marketId,
        walletAddress,
        teeToken,
      });
      setWalletPosition(nextPosition);
    } catch {
      setWalletPosition(null);
    } finally {
      setPositionLoading(false);
    }
  };

  useEffect(() => {
    loadMarket();
    const timer = window.setInterval(loadMarket, 5000);
    return () => window.clearInterval(timer);
  }, [marketId]);

  useEffect(() => {
    loadWalletPosition();
  }, [marketId, walletAddress]);

  const positionsHidden = market?.positionsHidden ?? false;
  const isPriceMarket = market?.account.oracle_kind === "pythPrice";
  const prices: MarketPrices = market
    ? calculatePriceFromReserves(
        market.account.yes_token_supply_minted,
        market.account.no_token_supply_minted,
      )
    : { yes: 0.5, no: 0.5 };
  const quoteState: MarketQuoteState | undefined = market
    ? {
        reserves: market.account.market_reserves,
        yesSupply: market.account.yes_token_supply_minted,
        noSupply: market.account.no_token_supply_minted,
      }
    : undefined;

  const active = market ? isMarketActive(market) : false;
  const timeRemaining = market ? getMarketTimeRemaining(market) : "";
  const endDate = market
    ? formatTimestamp(market.account.end_time)
    : new Date();
  const createdDate = market
    ? formatTimestamp(market.account.creation_time)
    : new Date();
  const tradingEnabled = market?.tradingEnabled ?? true;
  const disabledTradeReason =
    market?.account.resolved
      ? 'This market is already resolved. Trading is closed.'
      : market?.account.resolvable
        ? 'Resolution time has passed. Trading is closed while the oracle crank settles the outcome.'
        : undefined;
  const targetPrice = market?.priceMarket?.targetPriceUsd ?? null;
  const currentOraclePrice = market?.priceMarket?.currentPriceUsd ?? null;
  const direction = market?.priceMarket?.direction ?? "above";
  const priceRule = market?.priceMarket?.rule ?? "";

  const baseLiquidity = market
    ? parseInt(market.account.initial_liquidity, 16) / 1_000_000
    : 0;
  const yesMinted =
    market
      ? parseInt(market.account.yes_token_supply_minted, 16) / 1_000_000
      : 0;
  const noMinted =
    market
      ? parseInt(market.account.no_token_supply_minted, 16) / 1_000_000
      : 0;
  const totalVol = baseLiquidity + yesMinted + noMinted;

  const proofSteps = market
    ? [
        {
          label: "Created on Solana",
          complete: Boolean(market.proof?.createSignature || market.publicKey),
          signature: market.proof?.createSignature,
        },
        {
          label: "Delegated into MagicBlock",
          complete: Boolean(market.delegated),
          signature: market.proof?.marketDelegationSignature || undefined,
        },
        {
          label: "Private market state initialized",
          complete: Boolean(
            market.positionsHidden ||
            market.proof?.privateStateInitializationSignature,
          ),
          signature:
            market.proof?.privateStateInitializationSignature || undefined,
        },
        {
          label: "Resolved by oracle",
          complete: Boolean(market.account.resolved),
          signature: market.proof?.resolveSignature || undefined,
        },
        {
          label: "Committed back toward L1",
          complete: Boolean(market.proof?.commitSignature),
          signature: market.proof?.commitSignature || undefined,
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-eclipse-bg text-eclipse-text-main">
      <Navbar />

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-[1440px] mx-auto">
          {/* Back Button */}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-eclipse-text-muted hover:text-eclipse-text-main mb-6 font-medium text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Markets
          </button>

          {/* Loading */}
          {loading && (
            <div className="animate-pulse">
              <div className="h-8 bg-eclipse-border rounded w-24 mb-4" />
              <div className="h-12 bg-eclipse-border rounded w-3/4 mb-8" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 h-96 bg-eclipse-border rounded-lg" />
                <div className="h-96 bg-eclipse-border rounded-lg" />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-eclipse-red/10 border border-eclipse-red/20 rounded-lg p-6 text-center max-w-lg mx-auto">
              <p className="text-eclipse-red font-medium mb-4">{error}</p>
              <button
                onClick={loadMarket}
                className="px-4 py-2 bg-eclipse-red/20 hover:bg-eclipse-red/30 text-eclipse-red rounded-lg transition-colors font-semibold text-sm"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Market Content */}
          {!loading && market && (
            <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
              {/* Left Column - Market Info */}
              <div className="min-w-0 space-y-6">
                {/* Header Info */}
                {/* Polymarket-style Header Info */}
                <div className="flex justify-between items-start mb-8">
                  <div className="flex gap-4 items-start">
                    {/* Asset Icon Box */}
                    <div className="flex-shrink-0 mt-1 relative z-10 drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
                      <CryptoIcon 
                        asset={market.priceMarket?.asset} 
                        size={48} 
                        className="rounded-[14px] border border-white/[0.08]" 
                      />
                    </div>

                    {/* Title & Metadata */}
                    <div className="flex flex-col gap-1.5">
                      <h1 className="font-semibold text-xl md:text-2xl leading-tight text-eclipse-text-main tracking-tight">
                        {market.account.question}
                      </h1>
                      <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-eclipse-text-muted mt-0.5">
                        <span className="flex items-center gap-1.5 text-eclipse-text-muted/80 text-[13px]">
                          {formatTimestamp(
                            market.account.end_time,
                          ).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <img
                            src="/eclipse-logo.svg"
                            alt="Avatar"
                            className="w-4 h-4 rounded-full border border-eclipse-border"
                          />
                          Created by {market.account.creator.slice(0, 4)}...
                          {market.account.creator.slice(-4)}
                        </span>
                        <span>•</span>
                        <span>
                          $
                          {totalVol.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}{" "}
                          Vol.
                        </span>
                        {positionsHidden && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-eclipse-green bg-eclipse-green/10 px-2 py-0.5 rounded text-xs">
                              <Shield className="w-3.5 h-3.5" /> TEE Shielded
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>{" "}
                  {/* Closes flex gap-4 items-start */}
                  {/* Countdown Timer */}
                  <div className="hidden lg:block mt-2">
                    <MarketCountdown
                      resolutionTimestamp={parseInt(
                        market.account.end_time,
                        16,
                      )}
                    />
                  </div>
                </div>

                {/* Price Chart / Visual Placeholder */}
                <div className="relative mb-8 flex h-[420px] min-w-0 flex-col overflow-hidden">
                  {market.account.oracle_kind === "pythPrice" &&
                  market.priceMarket ? (
                    <PriceChart
                      asset={market.priceMarket.asset}
                      targetPriceUsd={market.priceMarket.targetPriceUsd}
                      direction={market.priceMarket.direction}
                      resolutionTimestamp={parseInt(
                        market.account.end_time,
                        16,
                      )}
                    />
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-6">
                        <div className="flex items-end gap-3">
                          <span className="text-4xl font-bold text-eclipse-green">
                            {(prices.yes * 100).toFixed(0)}¢
                          </span>
                          <span className="text-sm font-semibold text-eclipse-text-muted mb-1 border-b border-dashed border-eclipse-text-muted pb-0.5">
                            Yes
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {["1H", "1D", "1W", "ALL"].map((tf) => (
                            <button
                              key={tf}
                              className="px-3 py-1 rounded text-xs font-semibold text-eclipse-text-muted hover:text-eclipse-text-main hover:bg-eclipse-panel transition-colors"
                            >
                              {tf}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Chart Area or Privacy Shield */}
                      <div className="flex-1 relative flex flex-col items-center justify-center border-t border-eclipse-border/50 pt-8 mt-2">
                        {positionsHidden ? (
                          <>
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-eclipse-green/5 via-eclipse-bg/0 to-eclipse-bg/0 pointer-events-none"></div>
                            <Shield className="w-16 h-16 text-eclipse-green/20 mb-4" />
                            <h3 className="text-lg font-bold text-eclipse-text-main mb-1">
                              Private Positioning Active
                            </h3>
                            <p className="text-sm text-eclipse-text-muted max-w-sm text-center">
                              This market is running inside a MagicBlock TEE.
                              Individual positions stay private while aggregate
                              odds remain visible for real price discovery.
                            </p>
                          </>
                        ) : (
                          <>
                            <CircleDashed className="w-12 h-12 text-eclipse-text-muted/20 mb-3" />
                            <p className="text-sm text-eclipse-text-muted">
                              Insufficient historical data to generate chart.
                            </p>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Rules & Market Context */}
                <RulesSection
                  market={market}
                  isPriceMarket={isPriceMarket}
                  direction={direction}
                  targetPrice={targetPrice}
                  priceRule={priceRule}
                  createdDate={createdDate}
                />

                {/* About Section */}
                <div className="bg-transparent">
                  <h2 className="font-bold text-lg mb-5 text-white">About</h2>
                  <div className="space-y-4 text-sm text-white/70 leading-relaxed">
                    {isPriceMarket ? (
                      <p>
                        This market resolves to <strong className="text-white">Yes</strong> if{" "}
                        <strong className="text-white">
                          {market.priceMarket?.asset ?? "the asset price"}
                        </strong>{" "}
                        is <strong className="text-white">{direction}</strong>{" "}
                        <strong className="text-white">{formatUsdPrice(targetPrice)}</strong> at the
                        resolution timestamp. Otherwise it resolves to{" "}
                        <strong className="text-white">No</strong>.
                      </p>
                    ) : (
                      <p>
                        This market resolves according to its configured oracle
                        outcome at the end date.
                      </p>
                    )}
                    {positionsHidden && (
                      <div className="text-white/80 p-4 bg-white/[0.03] rounded-lg ring-1 ring-[#16a34a]/20 flex gap-3 items-start">
                        <Shield className="w-5 h-5 text-[#22c55e] shrink-0 mt-0.5" />
                        <span>
                          This market is running inside MagicBlock&apos;s Ephemeral
                          Rollup (TEE). Your side and size stay private; only
                          aggregate odds are visible for market pricing.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-y-5 mt-6 pt-6 border-t border-white/[0.06] text-sm">
                    <div>
                      <div className="text-white/40 mb-1 text-xs tracking-wider uppercase">
                        Created By
                      </div>
                      <div className="text-white font-mono text-xs flex items-center gap-2">
                        {market.account.creator.slice(0, 6)}...
                        {market.account.creator.slice(-4)}
                        <a
                          href={`https://explorer.solana.com/address/${market.account.creator}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-white/40 hover:text-white" />
                        </a>
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 mb-1 text-xs tracking-wider uppercase">
                        Contract Address
                      </div>
                      <div className="text-white font-mono text-xs flex items-center gap-2">
                        {market.publicKey.slice(0, 6)}...
                        {market.publicKey.slice(-4)}
                        <a
                          href={`https://explorer.solana.com/address/${market.publicKey}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-white/40 hover:text-white" />
                        </a>
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 mb-1 text-xs tracking-wider uppercase">
                        Start Date
                      </div>
                      <div className="text-white font-medium">
                        {createdDate.toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 mb-1 text-xs tracking-wider uppercase">
                        End Date
                      </div>
                      <div className="text-white font-medium">
                        {endDate.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Proof of Execution */}
                {market.tracked && (
                  <div className="eclipse-card p-6">
                    <h2 className="font-bold text-lg mb-2">
                      Proof of Execution
                    </h2>
                    <p className="text-sm text-eclipse-text-muted mb-6">
                      Honest devnet evidence for this market&apos;s real
                      lifecycle.
                    </p>

                    <div className="space-y-3">
                      {proofSteps.map((step) => (
                        <div
                          key={step.label}
                          className={`flex items-center justify-between gap-4 rounded-lg border p-3 text-sm ${
                            step.complete
                              ? "border-eclipse-green/20 bg-eclipse-green/5"
                              : "border-eclipse-border bg-eclipse-bg"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {step.complete ? (
                              <CheckCircle2 className="h-4 w-4 text-eclipse-green" />
                            ) : (
                              <CircleDashed className="h-4 w-4 text-eclipse-text-muted" />
                            )}
                            <span
                              className={
                                step.complete
                                  ? "font-medium text-eclipse-text-main"
                                  : "text-eclipse-text-muted"
                              }
                            >
                              {step.label}
                            </span>
                          </div>

                          {step.signature ? (
                            <a
                              href={explorerTxUrl(step.signature)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-eclipse-blue hover:underline text-xs"
                            >
                              View tx
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="font-medium text-eclipse-text-muted text-xs">
                              {step.complete ? "Verified" : "Pending"}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column - Trade Panel */}
              <div>
                <div className="sticky top-24">
                  {market.account.resolved ? (
                    <ClaimPanel market={market} onClaimComplete={loadMarket} />
                  ) : (
                    <TradePanel
                      marketAddress={marketId}
                      prices={prices}
                      quoteState={quoteState}
                      onTradeComplete={() => {
                        loadMarket();
                        loadWalletPosition();
                      }}
                      tradingEnabled={tradingEnabled}
                      disabledReason={disabledTradeReason}
                      positionsHidden={positionsHidden}
                      existingPosition={walletPosition}
                      positionLoading={positionLoading}
                    />
                  )}

                  {market.account.resolvable && !market.account.resolved && (
                    <ResolvePanel
                      market={market}
                      onResolveComplete={loadMarket}
                    />
                  )}

                  {/* No order book for AMM */}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatPanel({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string;
  subtext?: string;
  accent: "green" | "amber" | "blue";
}) {
  const accentClasses = {
    green: "border-eclipse-green/20 bg-eclipse-green/5 text-eclipse-green",
    amber: "border-amber-400/20 bg-amber-400/5 text-amber-300",
    blue: "border-sky-400/20 bg-sky-400/5 text-sky-300",
  }[accent];

  return (
    <div className={`rounded-2xl border p-4 ${accentClasses}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {subtext && <div className="mt-2 text-sm text-white/60">{subtext}</div>}
    </div>
  );
}
