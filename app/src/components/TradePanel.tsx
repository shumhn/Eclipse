'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePhantom, useAccounts, AddressType } from '@phantom/react-sdk';
import { Settings, CheckCircle, Shield, Copy, Check, Eye, EyeOff, ArrowRight, ExternalLink } from 'lucide-react';
import { MarketPrices, MarketQuoteState, Position, quoteSellToAmm, quoteTradeFromAmm } from '@/lib/api';
import {
  getOrFetchTeeAuthToken,
  delegatePrivatePosition,
  delegateTopupReceipt,
  preparePrivateFundingTransaction,
  preparePrivateSellTransaction,
  preparePositionTransaction,
  preparePrivateTradeTransaction,
  prepareTradeTransaction,
} from '@/lib/trading';
import { signAndSend } from '@/lib/magicblock';
import { PublicKey } from '@solana/web3.js';

interface TradePanelProps {
  marketAddress: string;
  prices: MarketPrices;
  quoteState?: MarketQuoteState;
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
  quoteState,
  onTradeComplete,
  tradingEnabled = true,
  disabledReason,
  positionsHidden = false,
  existingPosition = null,
  positionLoading = false,
}: TradePanelProps) {
  const { isConnected } = usePhantom();
  const accounts = useAccounts();

  const [tradeType, setTradeType] = useState<'buy' | 'sell' | 'deposit'>('buy');
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [fundingSuccess, setFundingSuccess] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [activeTeeToken, setActiveTeeToken] = useState<string | null>(null);
  const [depositSignature, setDepositSignature] = useState<string | null>(null);
  const [delegateSignature, setDelegateSignature] = useState<string | null>(null);
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
      return 'Add funds to this market first, then trade from your market TEE balance. Wallet-level Shielded USDC is separate from market position collateral.';
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

  const handleAddPrivateFunds = async () => {
    if (!fundAmount || parseFloat(fundAmount) <= 0) {
      setFundingError('Enter a valid USDC amount to add.');
      return;
    }

    const phantom = (window as any).phantom?.solana;
    if (!walletAddress || !phantom) {
      setFundingError('Wallet not connected');
      return;
    }

    setFunding(true);
    setFundingError(null);
    setFundingSuccess(null);
    setDepositSignature(null);
    setDelegateSignature(null);

    try {
      const fundUsdc = parseFloat(fundAmount);
      const teeToken = await getTeeToken();
      setActiveTeeToken(teeToken);
      const setup = await preparePositionTransaction({
        marketAddress,
        amountUsdc: fundUsdc,
        walletAddress,
      });

      const depositSig = await signAndSend(
        setup.transaction,
        (tx) => phantom.signTransaction(tx),
        { sendTo: 'base' }
      );
      setDepositSignature(depositSig);

      let topupReceiptAddress: string | undefined;
      if (setup.topupReceiptAddress && setup.topupNonce) {
        const { signature: delSig } = await delegateTopupReceipt({
          marketAddress,
          walletAddress,
          nonce: setup.topupNonce,
        });
        if (delSig) setDelegateSignature(delSig);
        topupReceiptAddress = setup.topupReceiptAddress;
      } else {
        const { signature: delSig } = await delegatePrivatePosition({
          marketAddress,
          walletAddress,
        });
        if (delSig) setDelegateSignature(delSig);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const preparedFunding = await preparePrivateFundingTransaction({
        marketAddress,
        walletAddress,
        topupReceiptAddress,
      }, teeToken);

      if (preparedFunding.transaction) {
        const signature = await signAndSend(
          preparedFunding.transaction,
          (tx) => phantom.signTransaction(tx),
          { sendTo: 'ephemeral', ephemeralToken: teeToken }
        );
        setTxSignature(signature);
      }

      setFundingSuccess(`${fundUsdc.toFixed(2)} USDC is now available inside your private TEE balance.`);
      setFundAmount('');
      onTradeComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add private funds';
      setFundingError(formatTradeError(message));
    } finally {
      setFunding(false);
    }
  };

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
    setDepositSignature(null);
    setDelegateSignature(null);

    try {
      const inputValue = parseFloat(amount);
      const amountUsdc = inputValue;
      const amountLamports = BigInt(Math.round(amountUsdc * 1_000_000));
      const sharesLamports = BigInt(Math.round(inputValue * 1_000_000));
      const ownedSideSharesLamports = side === 'yes' ? yesSharesLamports : noSharesLamports;

      let signature: string;
      const teeToken = positionsHidden ? await getTeeToken() : undefined;
      if (teeToken) setActiveTeeToken(teeToken);

      if (tradeType === 'sell') {
        if (!positionsHidden) {
          throw new Error('Selling is available for private TEE positions only.');
        }
        if (ownedSideSharesLamports < sharesLamports) {
          throw new Error(`You do not have enough ${side.toUpperCase()} shares to sell.`);
        }

        const prepared = await preparePrivateSellTransaction({
          marketAddress,
          side,
          shares: inputValue,
          walletAddress,
        }, teeToken);

        signature = await signAndSend(
          prepared.transaction,
          (tx) => phantom.signTransaction(tx),
          { sendTo: 'ephemeral', ephemeralToken: teeToken }
        );
        setTxSignature(signature);
        setSuccess(true);
        setAmount('');
        onTradeComplete?.();
        return;
      }

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

          const depositSig = await signAndSend(
            setup.transaction,
            (tx) => phantom.signTransaction(tx),
            { sendTo: 'base' }
          );
          setDepositSignature(depositSig);

          if (setup.topupReceiptAddress && setup.topupNonce) {
            const { signature: delSig } = await delegateTopupReceipt({
              marketAddress,
              walletAddress,
              nonce: setup.topupNonce,
            });
            if (delSig) setDelegateSignature(delSig);
            topupReceiptAddress = setup.topupReceiptAddress;
            topupNonce = setup.topupNonce;
            await new Promise((r) => setTimeout(r, 2000));
            return;
          }

          const { signature: delSig } = await delegatePrivatePosition({
            marketAddress,
            walletAddress,
          });
          if (delSig) setDelegateSignature(delSig);
          await new Promise((r) => setTimeout(r, 2000));
        };

        const needsTopup = !existingPosition?.delegated || privateBalanceLamports < amountLamports;
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
  const ownedSideSharesLamports = side === 'yes' ? yesSharesLamports : noSharesLamports;
  const ownedSideShares = Number(ownedSideSharesLamports) / 1_000_000;

  const inputAmount = amount ? parseFloat(amount) : 0;
  const amountUsdc = tradeType === 'buy' ? inputAmount : 0;
  const quote = quoteState && tradeType === 'buy'
    ? quoteTradeFromAmm(quoteState, side, amountUsdc)
    : {
        shares: currentPrice > 0 ? amountUsdc / currentPrice : 0,
        payoutIfWins: currentPrice > 0 ? amountUsdc / currentPrice : 0,
      };
  const sellQuote = quoteState && tradeType === 'sell'
    ? quoteSellToAmm(quoteState, side, inputAmount)
    : { collateralOut: inputAmount * currentPrice, averagePrice: currentPrice };
  const quotedShares = quote.shares;
  const quotedPayout = quote.payoutIfWins;
  const estimatedShares = (tradeType === 'sell' ? inputAmount : quotedShares).toFixed(2);
  const potentialReturn = (tradeType === 'sell' ? sellQuote.collateralOut : quotedPayout).toFixed(2);
  const returnPct = amountUsdc > 0 ? ((quotedPayout / amountUsdc - 1) * 100).toFixed(2) : '0.00';
  const averagePrice = tradeType === 'sell'
    ? sellQuote.averagePrice
    : quotedShares > 0
      ? amountUsdc / quotedShares
      : 0;

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
            className={`pb-3 font-bold text-sm tracking-wide transition-all relative ${tradeType === 'buy' ? 'text-white' : 'text-white/60 hover:text-white'}`}
            onClick={() => setTradeType('buy')}
          >
            Buy
            {tradeType === 'buy' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2ba859] to-[#22c55e]" />
            )}
          </button>
          {positionsHidden && hasPrivateExposure && (
            <button
              className={`pb-3 font-bold text-sm tracking-wide transition-all relative ${tradeType === 'sell' ? 'text-white' : 'text-white/60 hover:text-white'}`}
              onClick={() => setTradeType('sell')}
            >
              Sell
              {tradeType === 'sell' && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2ba859] to-[#22c55e]" />
              )}
            </button>
          )}
          {positionsHidden && (
            <button
              className={`pb-3 font-bold text-sm tracking-wide transition-all relative ${tradeType === 'deposit' ? 'text-[#4ade80]' : 'text-[#4ade80]/80 hover:text-[#4ade80]'}`}
              onClick={() => setTradeType('deposit')}
            >
              Deposit
              {tradeType === 'deposit' && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2ba859] to-[#22c55e]" />
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 pb-3 justify-end w-full">
          {isConnected && (
            <Link
              href={existingPositionUrl}
              className="group flex items-center gap-1.5 text-[11px] font-medium text-[#4ade80] hover:text-[#22c55e] tracking-wide uppercase transition-colors"
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
        {(tradeType === 'buy' || tradeType === 'sell') && (
          <>
            {/* Outcome Selector */}
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-widest text-white/45">
              <span>Market odds</span>
              <span>Execution estimated below</span>
            </div>
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
                <span className="text-white font-medium text-xs tracking-widest uppercase">
                  {tradeType === 'sell' ? 'Shares to Sell' : 'Amount'}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-white font-semibold tracking-widest uppercase">
                    {tradeType === 'sell' ? 'Shares' : 'USDC'}
                  </span>
                </div>
              </div>
              <div className="relative bg-white/[0.02] ring-1 ring-white/[0.06] rounded-lg overflow-hidden group-focus-within:ring-white/[0.15] transition-all duration-200">
                <div className="flex items-center h-16 px-4">
                  <span className="font-bold text-xl flex-shrink-0 text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                    {tradeType === 'sell' ? 'Shares' : 'USDC'}
                  </span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="w-full text-right bg-transparent font-bold text-4xl outline-none placeholder:text-white/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40 caret-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                  />
                </div>
                {/* Quick Amounts */}
                <div className="flex justify-center gap-2 px-4 pb-3">
                  {tradeType === 'sell'
                    ? [
                        { label: '25%', value: ownedSideShares * 0.25 },
                        { label: '50%', value: ownedSideShares * 0.5 },
                        { label: 'Max', value: ownedSideShares },
                      ].map((item) => (
                        <button
                          key={item.label}
                          onClick={() => setAmount(Math.max(0, item.value).toFixed(2))}
                          disabled={ownedSideShares <= 0}
                          className="px-4 py-1.5 bg-white/[0.04] ring-1 ring-white/[0.06] hover:ring-white/[0.15] hover:bg-white/[0.08] rounded-md text-[11px] font-semibold text-white hover:text-white transition-all duration-150 disabled:opacity-40"
                        >
                          {item.label}
                        </button>
                      ))
                    : [1, 5, 10, 100].map((val) => (
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
                   <div className="text-white text-xs leading-relaxed mt-0.5">
                     {tradeType === 'sell'
                       ? `Owned ${side.toUpperCase()} shares: ${ownedSideShares.toFixed(2)}. Proceeds return to your market private balance.`
                       : `Your position is hidden until market closes. Market private balance: $${formatUsdcUnits(privateBalanceLamports)}`}
                   </div>
                  </div>
              </div>
            )}

            {/* Estimate Details */}
            <div className="space-y-2.5 mb-4">
              <div className="flex justify-between text-[13px]">
                <span className="text-white">{tradeType === 'sell' ? 'Avg sell price' : 'Avg cost'}</span>
                <span className="text-white font-medium tabular-nums">{(averagePrice * 100).toFixed(1)}¢</span>
              </div>
              <div className="h-px bg-white/[0.04]" />
              <div className="flex justify-between text-[13px]">
                <span className="text-white/80">{tradeType === 'sell' ? 'Shares sold' : 'Estimated shares'}</span>
                <span className="text-white/80 font-medium tabular-nums">{estimatedShares}</span>
              </div>
              <div className="h-px bg-white/[0.04]" />
              <div className="flex justify-between text-[13px]">
                <span className="text-white/80">{tradeType === 'sell' ? 'Estimated USDC received' : 'Projected payout if right'}</span>
                <span className="text-[#4ade80] font-semibold tabular-nums">
                  ${potentialReturn}{tradeType === 'buy' ? ` (${returnPct}%)` : ''}
                </span>
              </div>
            </div>

            {error && (
              <div className="mb-6 text-xs text-[#f87171] p-3 bg-[#ef4444]/10 ring-1 ring-[#ef4444]/20 rounded-lg font-medium">
                {error}
              </div>
            )}

            <button
              onClick={handleTrade}
              disabled={loading || inputAmount <= 0 || !isConnected || (tradeType === 'sell' && inputAmount > ownedSideShares)}
              className="w-full bg-white text-black font-bold py-3.5 rounded-lg transition-all hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed mb-2 relative overflow-hidden flex items-center justify-center group"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : !isConnected ? (
                'Connect Wallet to Trade'
              ) : tradeType === 'sell' ? (
                'Sell Shares'
              ) : (
                'Trade'
              )}
            </button>
          </>
        )}

        {tradeType === 'deposit' && positionsHidden && (
          <div className="mb-4 rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-[14px] font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#4ade80]" />
                  Add Private Funds
                </div>
                <div className="text-[12px] text-white/50 mt-1">
                  Deposit USDC from your MagicBlock balance into this specific market. Once deposited, your trading position will be fully private.
                </div>
                <div className="text-[12px] text-white mt-3 font-semibold">
                  Market Private Balance: <span className="text-[#4ade80]">${formatUsdcUnits(privateBalanceLamports)}</span>
                </div>
              </div>
            </div>
            
            <div className="mb-2">
              <span className="text-white font-medium text-xs tracking-widest uppercase block mb-2">Amount</span>
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-3">
                  <div className="flex items-center">
                    <span className="mr-1 text-white/40 font-bold text-lg">$</span>
                    <input
                      type="number"
                      value={fundAmount}
                      onChange={(event) => setFundAmount(event.target.value)}
                      placeholder="0"
                      className="w-full bg-transparent text-lg font-semibold text-white outline-none placeholder:text-white/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleAddPrivateFunds}
              disabled={funding || !fundAmount || !isConnected}
              className="mt-3 w-full rounded-lg bg-[#16a34a] px-4 py-3 text-sm font-bold text-black transition-all hover:bg-[#22c55e] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {funding ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                'Add Funds'
              )}
            </button>
            {fundingSuccess && (
              <div className="mt-3 rounded-lg border border-[#16a34a]/20 bg-[#16a34a]/10 p-3 text-[12px] font-medium text-[#4ade80]">
                <div className="mb-2">{fundingSuccess}</div>
                <div className="flex flex-col gap-1 mt-3 pt-2 border-t border-[#16a34a]/20">
                  {depositSignature && (
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Deposit (L1):</span>
                      <a 
                        href={`https://explorer.solana.com/tx/${depositSignature}?cluster=devnet`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[#4ade80] hover:underline flex items-center gap-1"
                      >
                        {depositSignature.slice(0, 4)}...{depositSignature.slice(-4)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  {delegateSignature && (
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Delegate (L1):</span>
                      <a 
                        href={`https://explorer.solana.com/tx/${delegateSignature}?cluster=devnet`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[#4ade80] hover:underline flex items-center gap-1"
                      >
                        {delegateSignature.slice(0, 4)}...{delegateSignature.slice(-4)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  {txSignature && (
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Topup (TEE):</span>
                      <span className="text-[#4ade80] flex items-center gap-1">
                        {txSignature.slice(0, 4)}...{txSignature.slice(-4)}
                        <Check className="w-3 h-3" />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {fundingError && (
              <div className="mt-3 rounded-lg border border-[#ef4444]/20 bg-[#ef4444]/10 p-3 text-[12px] font-medium text-[#f87171]">
                {fundingError}
              </div>
            )}
          </div>
        )}

      </div>
      
      {/* Success Modal/View */}
      {success && txSignature && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-sm z-10 flex flex-col overflow-y-auto px-6 pb-6 pt-2 rounded-xl">
          <div className="flex flex-col items-center pt-0 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-[#16a34a]/20 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-[#4ade80]" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Trade Submitted</h3>
            <p className="text-sm text-white/60 mb-5 max-w-[280px]">
              {positionsHidden 
                ? 'Your private trade was submitted to MagicBlock TEE/PER.' 
                : 'Your trade was submitted directly on Solana.'}
            </p>

            {positionsHidden ? (
              <div className="space-y-4 w-full mb-6">

                <div className="w-full text-left rounded-xl border border-[#4ade80]/20 bg-[#4ade80]/5 p-4">
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
                  <div className="pt-3 border-t border-white/10">
                    <div className="w-full flex flex-col rounded-lg bg-black/40 border border-white/5 overflow-hidden divide-y divide-white/5">
                      {depositSignature && (
                        <div className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-white/[0.02] transition-colors">
                          <a 
                            href={`https://solscan.io/tx/${depositSignature}?cluster=devnet`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="group flex-1 flex items-center gap-3 truncate font-mono text-[12px] text-[#4ade80]/90 hover:text-[#4ade80] drop-shadow-[0_0_8px_rgba(74,222,128,0.4)] hover:drop-shadow-[0_0_12px_rgba(74,222,128,0.7)] transition-all duration-300"
                            title="View Deposit on Solscan"
                          >
                            <span className="font-sans font-bold uppercase tracking-widest text-[10px] text-[#4ade80]/60 group-hover:text-[#4ade80]/90 transition-colors">L1 Deposit</span>
                            <span className="truncate underline decoration-[#16a34a]/40 group-hover:decoration-[#4ade80]/60 underline-offset-4 transition-colors">{depositSignature}</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </a>
                        </div>
                      )}
                      {delegateSignature && (
                        <div className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-white/[0.02] transition-colors">
                          <a 
                            href={`https://solscan.io/tx/${delegateSignature}?cluster=devnet`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="group flex-1 flex items-center gap-3 truncate font-mono text-[12px] text-[#4ade80]/90 hover:text-[#4ade80] drop-shadow-[0_0_8px_rgba(74,222,128,0.4)] hover:drop-shadow-[0_0_12px_rgba(74,222,128,0.7)] transition-all duration-300"
                            title="View Delegation on Solscan"
                          >
                            <span className="font-sans font-bold uppercase tracking-widest text-[10px] text-[#4ade80]/60 group-hover:text-[#4ade80]/90 transition-colors">L1 Delegate</span>
                            <span className="truncate underline decoration-[#16a34a]/40 group-hover:decoration-[#4ade80]/60 underline-offset-4 transition-colors">{delegateSignature}</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </a>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-white/[0.02] transition-colors">
                        <a 
                          href={`https://explorer.solana.com/tx/${txSignature}?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app${activeTeeToken ? `%3Ftoken%3D${activeTeeToken}` : ''}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="group flex-1 flex items-center gap-3 truncate font-mono text-[12px] text-[#4ade80]/90 hover:text-[#4ade80] drop-shadow-[0_0_8px_rgba(74,222,128,0.4)] hover:drop-shadow-[0_0_12px_rgba(74,222,128,0.7)] transition-all duration-300"
                          title="View on Solana Explorer"
                        >
                          <span className="font-sans font-bold uppercase tracking-widest text-[10px] text-[#4ade80]/60 group-hover:text-[#4ade80]/90 transition-colors">TEE Trade</span>
                          <span className="truncate underline decoration-[#16a34a]/40 group-hover:decoration-[#4ade80]/60 underline-offset-4 transition-colors">{txSignature}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        </a>
                      </div>
                    </div>
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
                      className="group flex-1 flex items-center gap-3 truncate font-mono text-[12px] text-[#4ade80]/90 hover:text-[#4ade80] drop-shadow-[0_0_8px_rgba(74,222,128,0.4)] hover:drop-shadow-[0_0_12px_rgba(74,222,128,0.7)] transition-all duration-300"
                      title="View on Solscan"
                    >
                      <span className="font-sans font-bold uppercase tracking-widest text-[10px] text-[#4ade80]/60 group-hover:text-[#4ade80]/90 transition-colors">View Tx</span>
                      <span className="truncate underline decoration-[#16a34a]/40 group-hover:decoration-[#4ade80]/60 underline-offset-4 transition-colors">{txSignature}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-1 flex w-full items-center gap-3 px-4">
            <Link href={`/portfolio?market=${marketAddress}`} className="flex-1">
              <button className="w-full py-3 bg-white text-black rounded-lg font-semibold hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all">
                View Trade
              </button>
            </Link>
            <button
              onClick={() => {
                setSuccess(false);
                setTxSignature(null);
                setDepositSignature(null);
                setDelegateSignature(null);
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
