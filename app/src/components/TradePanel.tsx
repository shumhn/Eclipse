'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePhantom, useAccounts, AddressType } from '@phantom/react-sdk';
import { Settings, CheckCircle, Shield, Briefcase, ExternalLink } from 'lucide-react';
import { MarketPrices } from '@/lib/api';
import {
  getOrFetchTeeAuthToken,
  delegatePrivatePosition,
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
}

export default function TradePanel({
  marketAddress,
  prices,
  onTradeComplete,
  tradingEnabled = true,
  disabledReason,
  positionsHidden = false,
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

  const solanaAccount = accounts?.find((a) => a.addressType === AddressType.solana);
  const walletAddress = solanaAccount?.address || '';

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
      return 'This wallet already has a delegated position for this market. Use the private trade path instead of trying to create a new base-layer position.';
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
      let signature: string;
      const teeToken = positionsHidden ? await getTeeToken() : undefined;

      if (positionsHidden) {
        const setup = await preparePositionTransaction({
          marketAddress,
          amountUsdc: parseFloat(amount),
          walletAddress,
        });
        await signAndSend(
          setup.transaction,
          (tx) => phantom.signTransaction(tx),
          { sendTo: 'base' }
        );

        await delegatePrivatePosition({
          marketAddress,
          walletAddress,
        });

        const prepared = await preparePrivateTradeTransaction({
          marketAddress,
          side,
          amountUsdc: parseFloat(amount),
          walletAddress,
        });

        signature = await signAndSend(
          prepared.transaction,
          (tx) => phantom.signTransaction(tx),
          { sendTo: 'ephemeral', ephemeralToken: teeToken }
        );
      } else {
        const prepared = await prepareTradeTransaction({
          marketAddress,
          side,
          amountUsdc: parseFloat(amount),
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
        <div className="flex items-center gap-2 pb-3">
          <span className="text-[11px] font-medium text-white tracking-widest uppercase">Market</span>
          <Settings className="w-3.5 h-3.5 text-white cursor-pointer hover:text-white hover:rotate-90 transition-all duration-300" />
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
              Your trade has been placed successfully in the TEE.
            </p>
            <a
              href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#60a5fa] hover:text-[#93c5fd] transition-colors flex items-center gap-1 mb-6"
            >
              View Transaction <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setSuccess(false)} className="flex-1 py-3 ring-1 ring-white/[0.1] text-white rounded-lg font-semibold hover:bg-white/[0.05] transition-all">
               Trade Again
             </button>
             <Link href="/portfolio" className="flex-1">
                <button className="w-full py-3 bg-white text-black rounded-lg font-semibold hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all">
                  View Portfolio
                </button>
             </Link>
          </div>
        </div>
      )}
    </div>
  );
}
