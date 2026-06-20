'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePhantom, useAccounts, AddressType } from '@phantom/react-sdk';
import { Settings, CheckCircle, Shield, Copy, Check, Eye, EyeOff, ArrowRight, ExternalLink } from 'lucide-react';
import { MarketPrices, Position } from '@/lib/api';
import {
  getOrFetchTeeAuthToken,
  delegatePrivatePosition,
  delegateTopupReceipt,
  preparePositionTransaction,
  preparePrivateTradeTransaction,
  prepareTradeTransaction,
} from '@/lib/trading';
import { signAndSend } from '@/lib/magicblock';
import { PublicKey } from '@solana/web3.js';

interface TradePanelProps {
  marketAddress: string;
  prices: MarketPrices;
  onTradeComplete?: () => void;
  tradingEnabled?: boolean;
  disabledReason?: string;
  positionsHidden?: boolean;
  existingPosition?: Position | null;
  positionLoading?: boolean;
}

export default function TradePanel({
  marketAddress,
  prices,
  onTradeComplete,
  tradingEnabled = true,
  disabledReason,
  positionsHidden = false,
  existingPosition = null,
  positionLoading = false,
}: TradePanelProps) {
  const { isConnected } = usePhantom();
  const accounts = useAccounts();

  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [teeProof, setTeeProof] = useState<{
    found: boolean;
    slot: number | null;
    err: unknown | null;
    confirmationStatus: string | null;
    finalized: boolean;
  } | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const solanaAccount = accounts?.find((a) => a.addressType === AddressType.solana);
  const walletAddress = solanaAccount?.address || '';
  const teeProofFailed = Boolean(teeProof?.err);
  const existingPositionUrl = `/portfolio?market=${encodeURIComponent(marketAddress)}`;
  const privateBalanceLamports = existingPosition
    ? BigInt(existingPosition.collateralAvailable || '0')
    : BigInt(0);
  const yesSharesLamports = existingPosition
    ? BigInt(existingPosition.yesShares || '0')
    : BigInt(0);
  const noSharesLamports = existingPosition
    ? BigInt(existingPosition.noShares || '0')
    : BigInt(0);
  const hasExistingPrivatePosition = positionsHidden && Boolean(existingPosition?.delegated);
  const hasPrivateExposure = yesSharesLamports > BigInt(0) || noSharesLamports > BigInt(0);
  const formatUsdcUnits = (units: bigint) => (Number(units) / 1_000_000).toFixed(2);

  const formatTradeError = (message: string) => {
    if (message.includes('Missing token query param')) {
      return 'MagicBlock TEE auth was missing for this private transaction. Please approve the wallet message prompt and try again.';
    }

    if (
      message.includes('AccountOwnedByWrongProgram') ||
      message.includes('The given account is owned by a different program than expected')
    ) {
      return 'The wallet is still hitting the old delegated-account path. Refresh the app and try again; if it persists, the client or on-chain IDL is stale.';
    }

    if (message.includes('Private market state is not initialized in MagicBlock yet')) {
      return 'The market exists, but its private MagicBlock state has not been initialized yet. This market is not fully trade-ready yet.';
    }

    if (message.includes('Position already delegated in TEE')) {
      return 'This wallet already has a private TEE position. Try again; the app will use the private trade path.';
    }

    if (message.includes('Insufficient delegated collateral available for private trade')) {
      return 'This private position needs more USDC moved into MagicBlock TEE before this trade can execute. Try again so the app can top up and trade in one private flow.';
    }

    return message;
  };

  const getTeeToken = async () => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    const signer = (window as any).phantom?.solana;
    if (!signer?.signMessage) {
      throw new Error('Wallet cannot sign MagicBlock auth message');
    }

    return getOrFetchTeeAuthToken(
      new PublicKey(walletAddress),
      async (msg: Uint8Array) => (await signer.signMessage(msg, 'utf8')).signature,
    );
  };

  const needsPrivatePositionSetup = (message: string) =>
    message.includes('Private position not found') ||
    message.includes('Private position is not delegated into TEE yet') ||
    message.includes('No position found');

  useEffect(() => {
    if (!success || !txSignature || !positionsHidden) {
      setTeeProof(null);
      return;
    }

    let cancelled = false;

    const loadTeeProof = async () => {
      setProofLoading(true);
      try {
        const response = await fetch(`/api/tee/signature?signature=${encodeURIComponent(txSignature)}`);
        const json = await response.json();
        if (!cancelled) {
          setTeeProof(json.success ? json.data : null);
        }
      } catch {
        if (!cancelled) {
          setTeeProof(null);
        }
      } finally {
        if (!cancelled) {
          setProofLoading(false);
        }
      }
    };

    loadTeeProof();

    return () => {
      cancelled = true;
    };
  }, [positionsHidden, success, txSignature]);

  const copySignature = async () => {
    if (!txSignature) return;
    await navigator.clipboard.writeText(txSignature);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const handleTrade = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const phantom = (window as any).phantom?.solana;
    if (!walletAddress || !phantom) {
      setError('Wallet not connected');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const amountUsdc = parseFloat(amount);
      const amountLamports = BigInt(Math.round(amountUsdc * 1_000_000));

      let signature: string;
      const teeToken = positionsHidden ? await getTeeToken() : undefined;

      if (positionsHidden) {
        let prepared: { transaction: string; positionAddress?: string; sendTo?: string } | undefined;
        let topupReceiptAddress: string | undefined;
        let topupNonce: string | undefined;

        const setupAndDelegate = async () => {
          const setup = await preparePositionTransaction({
            marketAddress,
            amountUsdc,
            walletAddress,
          });

          await signAndSend(
            setup.transaction,
            (tx) => phantom.signTransaction(tx),
            { sendTo: 'base' }
          );

          if (setup.topupReceiptAddress && setup.topupNonce) {
            await delegateTopupReceipt({
              marketAddress,
              walletAddress,
              nonce: setup.topupNonce,
            });
            topupReceiptAddress = setup.topupReceiptAddress;
            topupNonce = setup.topupNonce;
            // Give PER time to see the newly delegated receipt
            await new Promise((r) => setTimeout(r, 2000));
            return;
          }

          await delegatePrivatePosition({
            marketAddress,
            walletAddress,
          });
          // Give PER time to see the newly delegated position
          await new Promise((r) => setTimeout(r, 2000));
        };

        // For repeat trades: position is already delegated but balance is
        // insufficient → topup path. Also covers edge case where balance
        // data is stale (always topup if we have an existing delegated
        // position and don't have enough).
        const needsTopup =
          existingPosition?.delegated && privateBalanceLamports < amountLamports;

        if (needsTopup) {
          await setupAndDelegate();
        }

        const attemptPrepare = async (retries = 2): Promise<typeof prepared> => {
          try {
            return await preparePrivateTradeTransaction({
              marketAddress,
              side,
              amountUsdc,
              walletAddress,
              topupReceiptAddress,
              topupNonce,
            }, teeToken);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);

            // If the private position isn't set up yet, do the full setup
            if (needsPrivatePositionSetup(msg)) {
              await setupAndDelegate();
              return preparePrivateTradeTransaction({
                marketAddress,
                side,
                amountUsdc,
                walletAddress,
                topupReceiptAddress,
                topupNonce,
              }, teeToken);
            }

            // If it's a collateral/receipt error and we have retries, wait and retry
            // (PER may not have seen the delegated receipt yet)
            if (retries > 0 && (
              msg.includes('Insufficient') ||
              msg.includes('receipt') ||
              msg.includes('6008')
            )) {
              await new Promise((r) => setTimeout(r, 2500));
              return attemptPrepare(retries - 1);
            }

            throw err;
          }
        };

        prepared = await attemptPrepare();

        signature = await signAndSend(
          prepared!.transaction,
          (tx) => phantom.signTransaction(tx),
          { sendTo: 'ephemeral', ephemeralToken: teeToken }
        );
      } else {
        const prepared = await prepareTradeTransaction({
          marketAddress,
          side,
          amountUsdc,
          walletAddress,
        });

        signature = await signAndSend(
          prepared.transaction,
          (tx) => phantom.signTransaction(tx),
          { sendTo: 'ephemeral', ephemeralToken: teeToken }
        );
      }

      setTxSignature(signature);
      setSuccess(true);
      setAmount('');
      onTradeComplete?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? formatTradeError(err.message) : 'Failed to execute trade';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const currentPrice = side === 'yes' ? prices.yes : prices.no;
  const estimatedShares = amount ? (parseFloat(amount) / currentPrice).toFixed(2) : '0.00';
  const potentialReturn = amount ? (parseFloat(amount) / currentPrice).toFixed(2) : '0.00';

  if (!tradingEnabled) {
    return (
      <div className="eclipse-card p-6">
        <div className="text-center py-8">
          <h3 className="font-bold text-lg mb-2 text-eclipse-text-main">Trading Disabled</h3>
          <p className="text-eclipse-text-muted text-sm mb-4">
            {disabledReason ?? 'This market does not support trading yet.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-transparent w-full text-white font-sans relative">
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-5 pt-4 pb-0">
        <div className="flex gap-6">
          <button
            className={`pb-3 font-bold text-sm tracking-wide transition-all relative ${tradeType === 'buy' ? 'text-white' : 'text-white hover:text-white'}`}
            onClick={() => setTradeType('buy')}
          >
            Buy
            {tradeType === 'buy' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2ba859] to-[#22c55e]" />
            )}
          </button>
          <button
            className={`pb-3 font-bold text-sm tracking-wide transition-all relative ${tradeType === 'sell' ? 'text-white' : 'text-white hover:text-white'}`}
            onClick={() => setTradeType('sell')}
          >
            Sell
            {tradeType === 'sell' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#ef4444] to-[#f87171]" />
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 pb-3 justify-end w-full">
          {isConnected && (
            <Link
              href={existingPositionUrl}
              className="group flex items-center gap-1.5 text-[11px] font-medium text-white/50 hover:text-white tracking-wide uppercase transition-colors"
            >
              My Position
              <ExternalLink className="w-3.5 h-3.5 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform duration-300" />
            </Link>
          )}
        </div>
      </div>

      {/* Thin separator */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      <div className="px-5 pt-4 pb-4">
        {/* Outcome Selector */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setSide('yes')}
            className={`flex-1 py-2.5 px-5 rounded-lg flex justify-between items-center transition-all duration-200 font-semibold text-[13px] tracking-wide ${
              side === 'yes'
                ? 'bg-[#16a34a]/20 text-[#4ade80] ring-1 ring-[#16a34a]/40'
                : 'bg-white/[0.03] text-white ring-1 ring-white/[0.06] hover:ring-white/[0.12] hover:text-white'
            }`}
          >
            <span>Yes</span>
            <span className="font-bold tabular-nums">{(prices.yes * 100).toFixed(1)}¢</span>
          </button>
          <button
            onClick={() => setSide('no')}
            className={`flex-1 py-2.5 px-5 rounded-lg flex justify-between items-center transition-all duration-200 font-semibold text-[13px] tracking-wide ${
              side === 'no'
                ? 'bg-[#ef4444]/20 text-[#f87171] ring-1 ring-[#ef4444]/40'
                : 'bg-white/[0.03] text-white ring-1 ring-white/[0.06] hover:ring-white/[0.12] hover:text-white'
            }`}
          >
            <span>No</span>
            <span className="font-bold tabular-nums">{(prices.no * 100).toFixed(1)}¢</span>
          </button>
        </div>

        {/* Amount Input */}
        <div className="mb-4 relative group">
          <div className="flex justify-between items-center mb-2">
            <span className="text-white font-medium text-xs tracking-widest uppercase">Amount</span>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-white font-semibold tracking-widest uppercase">USDC</span>
            </div>
          </div>
          <div className="relative bg-white/[0.02] ring-1 ring-white/[0.06] rounded-lg overflow-hidden group-focus-within:ring-white/[0.15] transition-all duration-200">
            <div className="flex items-center h-12 px-4">
              <span className="text-white/60 font-bold text-2xl mr-1">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-white font-bold text-2xl outline-none placeholder:text-white/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            {/* Quick Amounts */}
            <div className="flex justify-center gap-2 px-4 pb-3">
              {[1, 5, 10, 100].map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className="px-4 py-1.5 bg-white/[0.04] ring-1 ring-white/[0.06] hover:ring-white/[0.15] hover:bg-white/[0.08] rounded-md text-[11px] font-semibold text-white hover:text-white transition-all duration-150"
                >
                  +${val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TEE Note */}
        {positionsHidden && (
          <div className="flex items-start gap-3 mb-4 p-3 bg-[#16a34a]/[0.06] ring-1 ring-[#16a34a]/20 rounded-lg">
             <Shield className="w-4 h-4 text-[#22c55e] shrink-0 mt-0.5" />
             <div>
               <div className="font-semibold text-[13px] text-[#4ade80]">Shielded inside TEE</div>
               <div className="text-white text-xs leading-relaxed mt-0.5">Your position is hidden until market closes.</div>
              </div>
          </div>
        )}


        {/* Estimate Details */}
        <div className="space-y-2.5 mb-4">
          <div className="flex justify-between text-[13px]">
            <span className="text-white">Avg price</span>
            <span className="text-white font-medium tabular-nums">{(currentPrice * 100).toFixed(1)}¢</span>
          </div>
          <div className="h-px bg-white/[0.04]" />
          <div className="flex justify-between text-[13px]">
            <span className="text-white/80">Estimated shares</span>
            <span className="text-white/80 font-medium tabular-nums">{estimatedShares}</span>
          </div>
          <div className="h-px bg-white/[0.04]" />
          <div className="flex justify-between text-[13px]">
            <span className="text-white/80">Potential return</span>
            <span className="text-[#4ade80] font-semibold tabular-nums">${potentialReturn} ({amount ? ((parseFloat(potentialReturn) / parseFloat(amount) - 1) * 100).toFixed(2) : '0.00'}%)</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 text-xs text-[#f87171] p-3 bg-[#ef4444]/10 ring-1 ring-[#ef4444]/20 rounded-lg font-medium">
            {error}
          </div>
        )}

        {/* Your Position */}
        {(hasPrivateExposure || privateBalanceLamports > BigInt(0)) && (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Your Position</div>
            <div className="space-y-2.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-white/80">Available USDC</span>
                <span className="text-[#4ade80] font-medium tabular-nums">{formatUsdcUnits(privateBalanceLamports)}</span>
              </div>
              {yesSharesLamports > BigInt(0) && (
                <>
                  <div className="h-px bg-white/[0.04]" />
                  <div className="flex justify-between text-[13px]">
                    <span className="text-white/80">Yes Shares</span>
                    <span className="text-white font-medium tabular-nums">{formatUsdcUnits(yesSharesLamports)}</span>
                  </div>
                </>
              )}
              {noSharesLamports > BigInt(0) && (
                <>
                  <div className="h-px bg-white/[0.04]" />
                  <div className="flex justify-between text-[13px]">
                    <span className="text-white/80">No Shares</span>
                    <span className="text-white font-medium tabular-nums">{formatUsdcUnits(noSharesLamports)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Trade Action */}
        {!isConnected ? (
          <button className="w-full py-4 bg-white text-black font-bold rounded-lg transition-all duration-200 text-sm tracking-wide hover:shadow-[0_0_30px_rgba(255,255,255,0.12)] active:scale-[0.98]">
             Connect Wallet
          </button>
        ) : (
          <button
            onClick={handleTrade}
            disabled={loading || !amount}
            className="w-full py-4 font-bold rounded-lg transition-all duration-200 text-sm tracking-wide bg-white text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.12)] active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </span>
            ) : 'Trade'}
          </button>
        )}
      </div>
      
      {/* Success Modal/View */}
      {success && txSignature && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-sm z-10 flex flex-col p-6 rounded-xl">
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="w-16 h-16 rounded-full bg-[#16a34a]/20 flex items-center justify-center mb-5">
              <CheckCircle className="w-8 h-8 text-[#4ade80]" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Trade Submitted</h3>
            <p className="text-sm text-white/80 mb-6">
              {positionsHidden
                ? 'Your private trade was submitted to MagicBlock TEE/PER.'
                : 'Your trade has been submitted.'}
            </p>
            {positionsHidden ? (
              <div className="w-full text-left mb-6 rounded-xl border border-[#16a34a]/25 bg-[#16a34a]/10 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-sm font-bold text-[#4ade80]">TEE Trade Proof</div>
                    <div className="text-[11px] text-white/50">Verified with MagicBlock TEE RPC</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    teeProofFailed
                      ? 'bg-[#ef4444]/20 text-[#f87171]'
                      : teeProof?.finalized
                        ? 'bg-[#16a34a]/20 text-[#4ade80]'
                        : 'bg-white/10 text-white/60'
                  }`}>
                    {proofLoading
                      ? 'Checking'
                      : teeProofFailed
                        ? 'Failed'
                        : teeProof?.finalized
                          ? 'Finalized'
                          : 'Submitted'}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="text-white/50">RPC</span>
                    <span className="text-white/80 font-mono">devnet-tee.magicblock.app</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-white/50">Slot</span>
                    <span className="text-white/80 font-mono">{teeProof?.slot ?? 'Checking...'}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-white/50">Error</span>
                    <span className={`font-mono ${teeProofFailed ? 'text-[#f87171]' : 'text-white/80'}`}>
                      {teeProofFailed ? 'Failed' : 'None'}
                    </span>
                  </div>
                  {teeProofFailed && (
                    <div className="rounded-lg border border-[#ef4444]/20 bg-[#ef4444]/10 p-2 font-mono text-[11px] text-[#fca5a5]">
                      {JSON.stringify(teeProof?.err)}
                    </div>
                  )}
                  <div className="pt-2 border-t border-white/10">
                    <div className="flex w-full items-center justify-between gap-3 rounded-lg bg-black/30 px-3 py-2">
                      <a 
                        href={`https://solscan.io/tx/${txSignature}?cluster=devnet`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="truncate font-mono text-[11px] text-[#4ade80] hover:text-[#22c55e] hover:underline flex items-center gap-1.5"
                        title="View on Solana Explorer"
                      >
                        {txSignature}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        type="button"
                        onClick={copySignature}
                        className="hover:bg-black/45 p-1 rounded transition-colors"
                        title="Copy Signature"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 text-[#4ade80]" /> : <Copy className="h-3.5 w-3.5 text-white/50" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full text-left mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-bold text-white mb-3">Transaction Receipt</div>
                <div className="pt-2 border-t border-white/10">
                  <div className="flex w-full items-center justify-between gap-3 rounded-lg bg-black/30 px-3 py-2">
                    <a 
                      href={`https://solscan.io/tx/${txSignature}?cluster=devnet`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="truncate font-mono text-[11px] text-[#4ade80] hover:text-[#22c55e] hover:underline flex items-center gap-1.5"
                      title="View on Solscan"
                    >
                      {txSignature}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={copySignature}
                      className="hover:bg-black/45 p-1 rounded transition-colors"
                      title="Copy Signature"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-[#4ade80]" /> : <Copy className="h-3.5 w-3.5 text-white/50" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="w-full flex items-center gap-3 mt-auto">
            <Link href={`/portfolio?market=${marketAddress}`} className="flex-1">
              <button className="w-full py-3 bg-white text-black rounded-lg font-semibold hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all">
                View Trade
              </button>
            </Link>
            <button
              onClick={() => {
                setSuccess(false);
                setTxSignature(null);
                setAmount('');
              }}
              className="flex-1 py-3 bg-transparent text-white border border-white/20 rounded-lg font-semibold hover:bg-white/5 transition-all"
            >
              Trade Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
