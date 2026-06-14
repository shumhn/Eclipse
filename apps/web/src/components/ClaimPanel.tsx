'use client';

import { useState } from 'react';
import { usePhantom, useAccounts, AddressType } from '@phantom/react-sdk';
import { CheckCircle, Gift, Info } from 'lucide-react';
import { Market } from '@/lib/api';
import { prepareSettleTransaction, prepareClaimTransaction } from '@/lib/trading';
import { signAndSend } from '@/lib/magicblock';

interface ClaimPanelProps {
  market: Market;
  onClaimComplete?: () => void;
}

export default function ClaimPanel({ market, onClaimComplete }: ClaimPanelProps) {
  const { isConnected } = usePhantom();
  const accounts = useAccounts();
  const solanaAccount = accounts?.find((a) => a.addressType === AddressType.solana);
  const walletAddress = solanaAccount?.address || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'idle' | 'settling' | 'committing' | 'claiming' | 'success'>('idle');

  const handleClaim = async () => {
    const phantom = (window as any).phantom?.solana;
    if (!walletAddress || !phantom) {
      setError('Wallet not connected');
      return;
    }

    setLoading(true);
    setError(null);
    setStep('settling');

    try {
      // Step 1: Settle private position in TEE
      const settleSetup = await prepareSettleTransaction({
        marketAddress: market.publicKey,
        walletAddress,
      });

      await signAndSend(
        settleSetup.transaction,
        (tx) => phantom.signTransaction(tx),
        { sendTo: 'ephemeral' }
      );

      // Step 2: Commit position state to L1
      setStep('committing');

      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/trading/commit-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: market.publicKey,
          walletAddress,
        }),
      });

      // Step 3: Claim settled position on L1
      setStep('claiming');
      
      const claimSetup = await prepareClaimTransaction({
        marketAddress: market.publicKey,
        walletAddress,
      });

      await signAndSend(
        claimSetup.transaction,
        (tx) => phantom.signTransaction(tx),
        { sendTo: 'base' }
      );

      setStep('success');
      onClaimComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim winnings');
      setStep('idle');
    } finally {
      setLoading(false);
    }
  };

  const outcomeStr = ('Some' in market.account.winning_token_id) ? (market.account.winning_token_id as any).Some?.toUpperCase() || 'UNKNOWN' : 'UNKNOWN';

  return (
    <div className="bg-poly-panel rounded-xl w-full text-poly-text-main font-sans border border-poly-border shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-poly-blue/20 to-poly-bg p-5 border-b border-poly-border">
        <div className="flex items-center gap-2 mb-2">
          <Gift className="w-5 h-5 text-poly-blue" />
          <h3 className="font-bold text-lg">Market Resolved</h3>
        </div>
        <p className="text-sm text-poly-text-muted">
          This market has resolved to <strong className={outcomeStr === 'YES' ? 'text-poly-green' : 'text-poly-red'}>{outcomeStr}</strong>.
          You can now settle your private position and claim your winnings to your wallet.
        </p>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-2 p-3 bg-[#1A1D21] border border-poly-border rounded-lg text-xs mb-6">
          <Info className="w-4 h-4 text-poly-text-muted shrink-0 mt-0.5" />
          <div className="text-poly-text-muted">
            The claim process takes two steps: first settling your private shares inside the TEE to calculate your payout, and then claiming the USDC from the L1 market vault. Both steps will prompt your wallet.
          </div>
        </div>

        {error && (
          <div className="mb-6 text-xs text-poly-red p-3 bg-poly-red/10 border border-poly-red/20 rounded-lg font-medium">
            {error}
          </div>
        )}

        {step === 'success' ? (
           <div className="flex flex-col items-center justify-center py-6 text-center">
             <CheckCircle className="w-12 h-12 text-poly-green mb-4" />
             <h3 className="text-lg font-bold text-poly-text-main mb-1">Claim Successful!</h3>
             <p className="text-sm text-poly-text-muted">
               Your winnings have been transferred to your wallet.
             </p>
           </div>
        ) : !isConnected ? (
          <button className="w-full py-3.5 bg-poly-blue hover:bg-[#0070DF] text-white font-bold rounded-lg transition-all shadow-[0_4px_14px_0_rgba(0,130,255,0.39)]">
             Connect Wallet to Claim
          </button>
        ) : (
          <button
            onClick={handleClaim}
            disabled={loading}
            className={`w-full py-3.5 font-bold rounded-lg transition-all shadow-[0_4px_14px_0_rgba(0,130,255,0.39)] text-white
              ${loading
                ? 'bg-[#24282D] text-poly-text-muted cursor-not-allowed border border-poly-border shadow-none'
                : 'bg-poly-blue hover:bg-[#0070DF]'
              }
            `}
          >
            {step === 'settling' ? '1/3 Settling in TEE...' : step === 'committing' ? '2/3 Finalizing on Solana...' : step === 'claiming' ? '3/3 Claiming to Wallet...' : 'Claim Winnings'}
          </button>
        )}
      </div>
    </div>
  );
}
