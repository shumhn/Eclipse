'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePhantom, useAccounts, AddressType } from '@phantom/react-sdk';
import { Settings, CheckCircle, Shield, Briefcase, ExternalLink } from 'lucide-react';
import { MarketPrices } from '@/lib/api';
import {
  delegatePrivatePosition,
  preparePositionTransaction,
  preparePrivateTradeTransaction,
  prepareTradeTransaction,
} from '@/lib/trading';
import { signAndSend } from '@/lib/magicblock';

interface TradePanelProps {
  marketAddress: string;
  prices: MarketPrices;
  onTradeComplete?: () => void;
  tradingEnabled?: boolean;
  positionsHidden?: boolean;
}

export default function TradePanel({
  marketAddress,
  prices,
  onTradeComplete,
  tradingEnabled = true,
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
    if (
      message.includes('AccountOwnedByWrongProgram') ||
      message.includes('The given account is owned by a different program than expected')
    ) {
      return 'This market is already delegated into MagicBlock. A fresh wallet cannot open its first position on this delegated market yet, so read/proof flows work but first-time trading is still blocked.';
    }

    if (message.includes('Private market state is not initialized in MagicBlock yet')) {
      return 'The market exists, but its private MagicBlock state has not been initialized yet. This market is not fully trade-ready yet.';
    }

    if (message.includes('Position already delegated in TEE')) {
      return 'This wallet already has a delegated position for this market. Use the private trade path instead of trying to create a new base-layer position.';
    }

    return message;
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
          { sendTo: 'ephemeral' }
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
          { sendTo: 'ephemeral' }
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
      <div className="poly-card p-6">
        <div className="text-center py-8">
          <h3 className="font-bold text-lg mb-2 text-poly-text-main">Trading Disabled</h3>
          <p className="text-poly-text-muted text-sm mb-4">
            This market does not support trading yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-poly-panel rounded-xl w-full text-poly-text-main font-sans border border-poly-border shadow-lg">
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-5 pt-4 border-b border-poly-border">
        <div className="flex gap-6">
          <button
            className={`pb-3 font-semibold text-sm transition-colors relative ${tradeType === 'buy' ? 'text-poly-text-main' : 'text-poly-text-muted hover:text-poly-text-main'}`}
            onClick={() => setTradeType('buy')}
          >
            Buy
            {tradeType === 'buy' && <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-poly-text-main rounded-t-full" />}
          </button>
          <button
            className={`pb-3 font-semibold text-sm transition-colors relative ${tradeType === 'sell' ? 'text-poly-text-main' : 'text-poly-text-muted hover:text-poly-text-main'}`}
            onClick={() => setTradeType('sell')}
          >
            Sell
            {tradeType === 'sell' && <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-poly-text-main rounded-t-full" />}
          </button>
        </div>
        <div className="flex items-center gap-1.5 pb-3">
          <span className="text-xs font-medium text-poly-text-muted">Market</span>
          <Settings className="w-3.5 h-3.5 text-poly-text-muted cursor-pointer hover:text-poly-text-main transition-colors" />
        </div>
      </div>

      <div className="p-5">
        {/* Outcome Selector */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setSide('yes')}
            className={`flex-1 py-3 px-4 rounded-lg flex justify-between items-center transition-all font-semibold ${
              side === 'yes'
                ? 'bg-poly-green text-white shadow-[0_0_10px_rgba(43,168,89,0.3)] border border-transparent'
                : 'bg-[#24282D] border border-transparent text-poly-text-muted hover:bg-[#2C3137]'
            }`}
          >
            <span>Yes</span>
            <span className={side === 'yes' ? 'text-white font-bold' : 'text-poly-text-muted'}>{(prices.yes * 100).toFixed(1)}¢</span>
          </button>
          <button
            onClick={() => setSide('no')}
            className={`flex-1 py-3 px-4 rounded-lg flex justify-between items-center transition-all font-semibold ${
              side === 'no'
                ? 'bg-poly-red text-white shadow-[0_0_10px_rgba(228,62,75,0.3)] border border-transparent'
                : 'bg-[#24282D] border border-transparent text-poly-text-muted hover:bg-[#2C3137]'
            }`}
          >
            <span>No</span>
            <span className={side === 'no' ? 'text-white font-bold' : 'text-poly-text-muted'}>{(prices.no * 100).toFixed(1)}¢</span>
          </button>
        </div>

        {/* Amount Input */}
        <div className="mb-6 relative group">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-poly-text-muted font-medium">Amount</span>
            <span className="text-poly-text-muted font-medium">USDC</span>
          </div>
          <div className="relative bg-[#1A1D21] border border-poly-border rounded-lg p-1 group-focus-within:border-poly-text-muted transition-colors">
            <div className="flex items-center h-14 px-3">
              <span className="text-poly-text-muted font-bold text-xl mr-1">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-poly-text-main font-bold text-3xl outline-none placeholder:text-poly-text-muted/30"
              />
            </div>
            {/* Quick Amounts */}
            <div className="flex justify-end gap-1.5 px-3 pb-3">
              {[1, 5, 10, 100].map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className="px-3 py-1 bg-[#24282D] hover:bg-[#2C3137] rounded-full text-xs font-semibold text-poly-text-muted transition-colors"
                >
                  +${val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TEE Note */}
        {positionsHidden && (
          <div className="flex items-start gap-2 mb-6 p-3 bg-[#1A1D21] border border-poly-border rounded-lg text-xs">
             <Shield className="w-4 h-4 text-poly-green shrink-0 mt-0.5" />
             <div>
               <div className="font-semibold text-poly-green">Shielded inside TEE</div>
               <div className="text-poly-text-muted leading-tight mt-0.5">Your position is hidden until market closes.</div>
             </div>
          </div>
        )}

        {/* Estimate Details */}
        <div className="space-y-2.5 mb-6">
          <div className="flex justify-between text-xs">
            <span className="text-poly-text-muted font-medium">Avg price</span>
            <span className="text-poly-text-main font-semibold">{(currentPrice * 100).toFixed(1)}¢</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-poly-text-muted font-medium">Estimated shares</span>
            <span className="text-poly-text-main font-semibold">{estimatedShares}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-poly-text-muted font-medium">Potential return</span>
            <span className="text-poly-green font-semibold">${potentialReturn} ({amount ? ((parseFloat(potentialReturn) / parseFloat(amount) - 1) * 100).toFixed(2) : '0.00'}%)</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 text-xs text-poly-red p-3 bg-poly-red/10 border border-poly-red/20 rounded-lg font-medium">
            {error}
          </div>
        )}

        {/* Trade Action */}
        {!isConnected ? (
          <button className="w-full py-3.5 bg-poly-blue hover:bg-[#0070DF] text-white font-bold rounded-lg transition-all shadow-[0_4px_14px_0_rgba(0,130,255,0.39)]">
             Connect Wallet
          </button>
        ) : (
          <button
            onClick={handleTrade}
            disabled={loading || !amount}
            className={`w-full py-3.5 font-bold rounded-lg transition-all
              ${loading || !amount 
                ? 'bg-[#24282D] text-poly-text-muted cursor-not-allowed border border-poly-border' 
                : 'bg-poly-blue hover:bg-[#0070DF] text-white shadow-[0_4px_14px_0_rgba(0,130,255,0.39)]'
              }
            `}
          >
            {loading ? 'Processing...' : 'Trade'}
          </button>
        )}
      </div>
      
      {/* Success Modal/View */}
      {success && txSignature && (
        <div className="absolute inset-0 bg-poly-panel z-10 flex flex-col p-6 rounded-lg">
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <CheckCircle className="w-12 h-12 text-poly-green mb-4" />
            <h3 className="text-xl font-bold text-poly-text-main mb-2">Trade Submitted</h3>
            <p className="text-sm text-poly-text-muted mb-6">
              Your trade has been placed successfully in the TEE.
            </p>
            <a
              href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-poly-blue hover:underline flex items-center gap-1 mb-6"
            >
              View Transaction <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setSuccess(false)} className="flex-1 py-3 border border-poly-border text-poly-text-main rounded-lg font-semibold hover:bg-poly-border/50">
               Trade Again
             </button>
             <Link href="/portfolio" className="flex-1">
                <button className="w-full py-3 bg-poly-blue text-white rounded-lg font-semibold hover:bg-[#2482B6]">
                  View Portfolio
                </button>
             </Link>
          </div>
        </div>
      )}
    </div>
  );
}
