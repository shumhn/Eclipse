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
    <div className="bg-eclipse-panel rounded-xl w-full text-eclipse-text-main font-sans border border-eclipse-border shadow-lg">
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-5 pt-4 border-b border-eclipse-border">
        <div className="flex gap-6">
          <button
            className={`pb-3 font-semibold text-sm transition-colors relative ${tradeType === 'buy' ? 'text-eclipse-text-main' : 'text-eclipse-text-muted hover:text-eclipse-text-main'}`}
            onClick={() => setTradeType('buy')}
          >
            Buy
            {tradeType === 'buy' && <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-eclipse-text-main rounded-t-full" />}
          </button>
          <button
            className={`pb-3 font-semibold text-sm transition-colors relative ${tradeType === 'sell' ? 'text-eclipse-text-main' : 'text-eclipse-text-muted hover:text-eclipse-text-main'}`}
            onClick={() => setTradeType('sell')}
          >
            Sell
            {tradeType === 'sell' && <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-eclipse-text-main rounded-t-full" />}
          </button>
        </div>
        <div className="flex items-center gap-1.5 pb-3">
          <span className="text-xs font-medium text-eclipse-text-muted">Market</span>
          <Settings className="w-3.5 h-3.5 text-eclipse-text-muted cursor-pointer hover:text-eclipse-text-main transition-colors" />
        </div>
      </div>

      <div className="p-5">
        {/* Outcome Selector */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setSide('yes')}
            className={`flex-1 py-3 px-4 rounded-lg flex justify-between items-center transition-all font-semibold ${
              side === 'yes'
                ? 'bg-eclipse-green text-white shadow-[0_0_10px_rgba(43,168,89,0.3)] border border-transparent'
                : 'bg-[#24282D] border border-transparent text-eclipse-text-muted hover:bg-[#2C3137]'
            }`}
          >
            <span>Yes</span>
            <span className={side === 'yes' ? 'text-white font-bold' : 'text-eclipse-text-muted'}>{(prices.yes * 100).toFixed(1)}¢</span>
          </button>
          <button
            onClick={() => setSide('no')}
            className={`flex-1 py-3 px-4 rounded-lg flex justify-between items-center transition-all font-semibold ${
              side === 'no'
                ? 'bg-eclipse-red text-white shadow-[0_0_10px_rgba(228,62,75,0.3)] border border-transparent'
                : 'bg-[#24282D] border border-transparent text-eclipse-text-muted hover:bg-[#2C3137]'
            }`}
          >
            <span>No</span>
            <span className={side === 'no' ? 'text-white font-bold' : 'text-eclipse-text-muted'}>{(prices.no * 100).toFixed(1)}¢</span>
          </button>
        </div>

        {/* Amount Input */}
        <div className="mb-6 relative group">
          <div className="flex justify-between items-center text-sm mb-2">
            <span className="text-eclipse-text-muted font-medium">Amount</span>
            <div className="flex items-center gap-3">
              <a 
                href="https://spl-token-faucet.com/?token-name=USDC-Dev" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-eclipse-blue hover:underline flex items-center gap-1"
              >
                Get Devnet USDC <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-eclipse-text-muted font-medium">USDC</span>
            </div>
          </div>
          <div className="relative bg-[#1A1D21] border border-eclipse-border rounded-lg p-1 group-focus-within:border-eclipse-text-muted transition-colors">
            <div className="flex items-center h-14 px-3">
              <span className="text-eclipse-text-muted font-bold text-xl mr-1">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-eclipse-text-main font-bold text-3xl outline-none placeholder:text-eclipse-text-muted/30"
              />
            </div>
            {/* Quick Amounts */}
            <div className="flex justify-end gap-1.5 px-3 pb-3">
              {[1, 5, 10, 100].map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className="px-3 py-1 bg-[#24282D] hover:bg-[#2C3137] rounded-full text-xs font-semibold text-eclipse-text-muted transition-colors"
                >
                  +${val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TEE Note */}
        {positionsHidden && (
          <div className="flex items-start gap-2 mb-6 p-3 bg-[#1A1D21] border border-eclipse-border rounded-lg text-xs">
             <Shield className="w-4 h-4 text-eclipse-green shrink-0 mt-0.5" />
             <div>
               <div className="font-semibold text-eclipse-green">Shielded inside TEE</div>
               <div className="text-eclipse-text-muted leading-tight mt-0.5">Your position is hidden until market closes.</div>
             </div>
          </div>
        )}

        {/* Estimate Details */}
        <div className="space-y-2.5 mb-6">
          <div className="flex justify-between text-xs">
            <span className="text-eclipse-text-muted font-medium">Avg price</span>
            <span className="text-eclipse-text-main font-semibold">{(currentPrice * 100).toFixed(1)}¢</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-eclipse-text-muted font-medium">Estimated shares</span>
            <span className="text-eclipse-text-main font-semibold">{estimatedShares}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-eclipse-text-muted font-medium">Potential return</span>
            <span className="text-eclipse-green font-semibold">${potentialReturn} ({amount ? ((parseFloat(potentialReturn) / parseFloat(amount) - 1) * 100).toFixed(2) : '0.00'}%)</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 text-xs text-eclipse-red p-3 bg-eclipse-red/10 border border-eclipse-red/20 rounded-lg font-medium">
            {error}
          </div>
        )}

        {/* Trade Action */}
        {!isConnected ? (
          <button className="w-full py-3.5 bg-eclipse-blue hover:bg-[#0070DF] text-white font-bold rounded-lg transition-all shadow-[0_4px_14px_0_rgba(0,130,255,0.39)]">
             Connect Wallet
          </button>
        ) : (
          <button
            onClick={handleTrade}
            disabled={loading || !amount}
            className={`w-full py-3.5 font-bold rounded-lg transition-all
              ${loading || !amount 
                ? 'bg-[#24282D] text-eclipse-text-muted cursor-not-allowed border border-eclipse-border' 
                : 'bg-eclipse-blue hover:bg-[#0070DF] text-white shadow-[0_4px_14px_0_rgba(0,130,255,0.39)]'
              }
            `}
          >
            {loading ? 'Processing...' : 'Trade'}
          </button>
        )}
      </div>
      
      {/* Success Modal/View */}
      {success && txSignature && (
        <div className="absolute inset-0 bg-eclipse-panel z-10 flex flex-col p-6 rounded-lg">
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <CheckCircle className="w-12 h-12 text-eclipse-green mb-4" />
            <h3 className="text-xl font-bold text-eclipse-text-main mb-2">Trade Submitted</h3>
            <p className="text-sm text-eclipse-text-muted mb-6">
              Your trade has been placed successfully in the TEE.
            </p>
            <a
              href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-eclipse-blue hover:underline flex items-center gap-1 mb-6"
            >
              View Transaction <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setSuccess(false)} className="flex-1 py-3 border border-eclipse-border text-eclipse-text-main rounded-lg font-semibold hover:bg-eclipse-border/50">
               Trade Again
             </button>
             <Link href="/portfolio" className="flex-1">
                <button className="w-full py-3 bg-eclipse-blue text-white rounded-lg font-semibold hover:bg-[#2482B6]">
                  View Portfolio
                </button>
             </Link>
          </div>
        </div>
      )}
    </div>
  );
}
