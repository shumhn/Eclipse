'use client';

import { useEffect, useState } from 'react';
import { usePhantom, useAccounts, AddressType } from '@phantom/react-sdk';
import { CheckCircle, Gift, Info, Lock, RefreshCw } from 'lucide-react';
import { Market, Position, fetchPosition } from '@/lib/api';
import { prepareSettleTransaction, prepareClaimTransaction } from '@/lib/trading';
import { getOrFetchTeeAuthToken, signAndSend } from '@/lib/magicblock';
import { PublicKey } from '@solana/web3.js';

interface ClaimPanelProps {
  market: Market;
  onClaimComplete?: () => void;
}

type ClaimStep = 'idle' | 'settling' | 'committing' | 'claiming' | 'success' | 'noWinnings';

function amountToBigInt(value?: string): bigint {
  try {
    return BigInt(value || '0');
  } catch {
    return BigInt(0);
  }
}

function formatUsdc(units: bigint): string {
  return (Number(units) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export default function ClaimPanel({ market, onClaimComplete }: ClaimPanelProps) {
  const { isConnected } = usePhantom();
  const accounts = useAccounts();
  const solanaAccount = accounts?.find((a) => a.addressType === AddressType.solana);
  const walletAddress = solanaAccount?.address || '';

  const [position, setPosition] = useState<Position | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ClaimStep>('idle');
  const canSettleInTee = Boolean(market.delegated);

  const loadPosition = async () => {
    if (!walletAddress) {
      setPosition(null);
      return null;
    }

    setPositionLoading(true);
    try {
      const nextPosition = await fetchPosition({
        marketAddress: market.publicKey,
        walletAddress,
      });
      setPosition(nextPosition);
      return nextPosition;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your position');
      return null;
    } finally {
      setPositionLoading(false);
    }
  };

  useEffect(() => {
    setError(null);
    setStep('idle');
    loadPosition();
  }, [market.publicKey, walletAddress]);

  const claimableAmount = amountToBigInt(position?.claimableAmount);
  const claimedAmount = amountToBigInt(position?.claimedAmount);
  const remainingClaimable =
    claimableAmount > claimedAmount ? claimableAmount - claimedAmount : BigInt(0);
  const hasClaimableWinnings = remainingClaimable > BigInt(0);
  const isPositionSettled = Boolean(position?.settled);
  const isPositionClaimed = Boolean(position?.claimed);
  const cannotRecoverHere = Boolean(position && !isPositionSettled && !canSettleInTee);

  const handleClaim = async () => {
    const phantom = (window as any).phantom?.solana;
    if (!walletAddress || !phantom) {
      setError('Wallet not connected');
      return;
    }

    let currentPosition = position;
    if (!currentPosition) {
      currentPosition = await loadPosition();
    }

    if (!currentPosition) {
      setError('No position found for this wallet on this market.');
      return;
    }

    if (!currentPosition.settled && !canSettleInTee) {
      setError(
        'This position was not settled before the market left MagicBlock. It needs an admin recovery/re-delegation flow.'
      );
      return;
    }

    setLoading(true);
    setError(null);
    setStep(currentPosition.settled ? 'claiming' : 'settling');

    try {
      if (!currentPosition.settled) {
        const teeToken = await getOrFetchTeeAuthToken(
          new PublicKey(walletAddress),
          async (msg: Uint8Array) => (await phantom.signMessage(msg, 'utf8')).signature
        );

        const settleSetup = await prepareSettleTransaction({
          marketAddress: market.publicKey,
          walletAddress,
        });

        await signAndSend(
          settleSetup.transaction,
          (tx) => phantom.signTransaction(tx),
          { sendTo: 'ephemeral', ephemeralToken: teeToken }
        );

        setStep('committing');
        const commitResponse = await fetch('/api/trading/commit-position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            market: market.publicKey,
            walletAddress,
          }),
        });

        if (!commitResponse.ok) {
          const json = await commitResponse.json().catch(() => null);
          throw new Error(json?.error || 'Failed to finalize private position on Solana');
        }

        currentPosition = await loadPosition();
      }

      const nextClaimable = amountToBigInt(currentPosition?.claimableAmount);
      const nextClaimed = amountToBigInt(currentPosition?.claimedAmount);
      const nextRemaining =
        nextClaimable > nextClaimed ? nextClaimable - nextClaimed : BigInt(0);

      if (nextRemaining === BigInt(0)) {
        setStep('noWinnings');
        onClaimComplete?.();
        return;
      }

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
      await loadPosition();
      onClaimComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim winnings');
      setStep('idle');
    } finally {
      setLoading(false);
    }
  };

  const outcomeStr =
    'Some' in market.account.winning_token_id
      ? (market.account.winning_token_id as any).Some?.toUpperCase() || 'UNKNOWN'
      : 'UNKNOWN';

  const buttonLabel = (() => {
    if (positionLoading) return 'Loading Position...';
    if (!position) return 'No Position Found';
    if (isPositionClaimed) return 'Already Claimed';
    if (cannotRecoverHere) return 'Settlement Recovery Needed';
    if (!isPositionSettled) return 'Settle Position';
    if (!hasClaimableWinnings) return 'No Winnings';
    if (step === 'settling') return '1/3 Settling in TEE...';
    if (step === 'committing') return '2/3 Finalizing on Solana...';
    if (step === 'claiming') return '3/3 Claiming to Wallet...';
    return `Claim ${formatUsdc(remainingClaimable)} USDC`;
  })();

  const buttonDisabled =
    loading ||
    positionLoading ||
    !position ||
    isPositionClaimed ||
    cannotRecoverHere ||
    (isPositionSettled && !hasClaimableWinnings);

  return (
    <div className="bg-eclipse-panel rounded-xl w-full text-eclipse-text-main font-sans border border-eclipse-border shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-eclipse-blue/20 to-eclipse-bg p-5 border-b border-eclipse-border">
        <div className="flex items-center gap-2 mb-2">
          <Gift className="w-5 h-5 text-eclipse-blue" />
          <h3 className="font-bold text-lg">Market Resolved</h3>
        </div>
        <p className="text-sm text-eclipse-text-muted">
          This market resolved to{' '}
          <strong className={outcomeStr === 'YES' ? 'text-eclipse-green' : 'text-eclipse-red'}>
            {outcomeStr}
          </strong>
          . Your wallet position decides whether there is a payout to claim.
        </p>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-2 p-3 bg-[#1A1D21] border border-eclipse-border rounded-lg text-xs mb-4">
          <Info className="w-4 h-4 text-eclipse-text-muted shrink-0 mt-0.5" />
          <div className="text-eclipse-text-muted">
            {!position
              ? 'Connect the wallet that traded this market. We will check its private position before allowing claim.'
              : !isPositionSettled && canSettleInTee
                ? 'First settle your private position inside MagicBlock. After that, claimable payout becomes visible on Solana.'
                : cannotRecoverHere
                  ? 'This position is not settled, but the market is already back on L1. A keeper/admin recovery flow is needed for this old market.'
                  : isPositionSettled && hasClaimableWinnings
                    ? `Your settled payout is ${formatUsdc(remainingClaimable)} USDC.`
                    : 'Your position is settled, but there are no winnings to claim for this wallet.'}
          </div>
        </div>

        {position && (
          <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-eclipse-border bg-[#111418] p-3">
              <div className="text-eclipse-text-muted">Position</div>
              <div className="font-semibold text-eclipse-text-main">
                {isPositionSettled ? 'Settled' : 'Needs settlement'}
              </div>
            </div>
            <div className="rounded-lg border border-eclipse-border bg-[#111418] p-3">
              <div className="text-eclipse-text-muted">Claimable</div>
              <div className="font-semibold text-eclipse-text-main">
                {formatUsdc(remainingClaimable)} USDC
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 text-xs text-eclipse-red p-3 bg-eclipse-red/10 border border-eclipse-red/20 rounded-lg font-medium">
            {error}
          </div>
        )}

        {step === 'success' ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle className="w-12 h-12 text-eclipse-green mb-4" />
            <h3 className="text-lg font-bold text-eclipse-text-main mb-1">Claim Successful</h3>
            <p className="text-sm text-eclipse-text-muted">
              Your winnings have been transferred to your wallet.
            </p>
          </div>
        ) : step === 'noWinnings' ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Lock className="w-12 h-12 text-eclipse-text-muted mb-4" />
            <h3 className="text-lg font-bold text-eclipse-text-main mb-1">No Winnings</h3>
            <p className="text-sm text-eclipse-text-muted">
              This wallet has no claimable payout for the resolved outcome.
            </p>
          </div>
        ) : !isConnected ? (
          <button className="w-full py-3.5 bg-eclipse-blue hover:bg-[#0070DF] text-white font-bold rounded-lg transition-all shadow-[0_4px_14px_0_rgba(0,130,255,0.39)]">
            Connect Wallet to Check Position
          </button>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleClaim}
              disabled={buttonDisabled}
              className={`w-full py-3.5 font-bold rounded-lg transition-all shadow-[0_4px_14px_0_rgba(0,130,255,0.39)] text-white
                ${buttonDisabled
                  ? 'bg-[#24282D] text-eclipse-text-muted cursor-not-allowed border border-eclipse-border shadow-none'
                  : 'bg-eclipse-blue hover:bg-[#0070DF]'
                }
              `}
            >
              {buttonLabel}
            </button>

            <button
              onClick={loadPosition}
              disabled={positionLoading || loading}
              className="w-full py-2.5 rounded-lg border border-eclipse-border text-eclipse-text-muted hover:text-eclipse-text-main hover:bg-[#1A1D21] transition-colors text-sm font-semibold flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${positionLoading ? 'animate-spin' : ''}`} />
              Refresh Position
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
