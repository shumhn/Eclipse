'use client';

import { useEffect, useState } from 'react';
import { usePhantom, useAccounts, AddressType } from '@phantom/react-sdk';
import { CheckCircle, Trophy, Info, Lock, RefreshCw, ExternalLink, CircleDashed, CheckCircle2 } from 'lucide-react';
import { Market, Position, fetchPosition, explorerTxUrl } from '@/lib/api';
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
  const [settleSignature, setSettleSignature] = useState<string | null>(null);
  const [commitSignature, setCommitSignature] = useState<string | null>(null);
  const [claimSignature, setClaimSignature] = useState<string | null>(null);
  const canSettleInTee = Boolean(market.delegated);

  const loadPosition = async () => {
    if (!walletAddress) {
      setPosition(null);
      return null;
    }

    setPositionLoading(true);
    try {
      const signer = (window as any).phantom?.solana;
      const teeToken = signer?.signMessage
        ? await getOrFetchTeeAuthToken(
            new PublicKey(walletAddress),
            async (msg: Uint8Array) => (await signer.signMessage(msg, 'utf8')).signature
          )
        : undefined;

      const nextPosition = await fetchPosition({
        marketAddress: market.publicKey,
        walletAddress,
        teeToken,
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

        const settleSig = await signAndSend(
          settleSetup.transaction,
          (tx) => phantom.signTransaction(tx),
          { sendTo: 'ephemeral', ephemeralToken: teeToken }
        );
        setSettleSignature(settleSig);

        setStep('committing');
        const commitResponse = await fetch('/api/trading/commit-position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            market: market.publicKey,
            walletAddress,
          }),
        });

        const json = await commitResponse.json().catch(() => null);
        if (!commitResponse.ok) {
          throw new Error(json?.error || 'Failed to finalize private position on Solana');
        }
        if (json?.data?.commitSignature) {
          setCommitSignature(json.data.commitSignature);
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

      const signature = await signAndSend(
        claimSetup.transaction,
        (tx) => phantom.signTransaction(tx),
        { sendTo: 'base' }
      );

      setClaimSignature(signature);
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
    <div className="eclipse-card overflow-hidden">
      <div className="bg-gradient-to-b from-white/[0.04] to-transparent p-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="w-5 h-5 text-eclipse-green drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
          <h3 className="font-bold text-lg text-white tracking-tight">Market Resolved</h3>
        </div>
        <p className="text-sm text-eclipse-text-muted leading-relaxed">
          This market resolved to{' '}
          <strong className={outcomeStr === 'YES' ? 'text-eclipse-green drop-shadow-[0_0_5px_rgba(34,197,94,0.3)]' : 'text-[#f87171] drop-shadow-[0_0_5px_rgba(248,113,113,0.3)]'}>
            {outcomeStr}
          </strong>
          . Your wallet position decides whether there is a payout to claim.
        </p>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-3 p-3.5 bg-eclipse-panel border border-white/5 rounded-xl text-xs mb-5 shadow-inner">
          <Info className="w-4 h-4 text-eclipse-text-muted shrink-0 mt-0.5" />
          <div className="text-eclipse-text-muted leading-relaxed">
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
          <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col items-center justify-center">
              <div className="text-eclipse-text-muted text-xs uppercase tracking-widest mb-1">Position</div>
              <div className="font-bold text-white tracking-wide">
                {isPositionSettled ? 'Settled' : 'Needs settlement'}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-eclipse-green/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="text-eclipse-text-muted text-xs uppercase tracking-widest mb-1 relative z-10">Claimable</div>
              <div className="font-bold text-eclipse-green tracking-wide relative z-10">
                {formatUsdc(remainingClaimable)} USDC
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-5 text-xs text-[#f87171] p-3.5 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-xl font-medium">
            {error}
          </div>
        )}

        {step === 'success' ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-16 h-16 rounded-full bg-eclipse-green/10 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-eclipse-green" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1 tracking-tight">Claim Successful</h3>
            <p className="text-sm text-eclipse-text-muted mb-4">
              Your winnings have been transferred to your wallet.
            </p>
            <div className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="bg-gradient-to-b from-white/[0.04] to-transparent p-4 border-b border-white/[0.06]">
                <h3 className="font-bold text-white tracking-tight">Proof of Execution</h3>
                <p className="text-xs text-eclipse-text-muted mt-1">Honest devnet evidence for your claim</p>
              </div>
              <div className="p-4 space-y-3">
                {settleSignature && <ProofLink label="Settle private position" signature={settleSignature} isTee={true} />}
                {commitSignature && <ProofLink label="Finalize position on Solana" signature={commitSignature} />}
                {claimSignature && <ProofLink label="Claim winnings to wallet" signature={claimSignature} />}
              </div>
            </div>
          </div>
        ) : step === 'noWinnings' ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/10">
              <Lock className="w-8 h-8 text-white/40" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1 tracking-tight">No Winnings</h3>
            <p className="text-sm text-eclipse-text-muted">
              This wallet has no claimable payout for the resolved outcome.
            </p>
          </div>
        ) : !isConnected ? (
          <button className="w-full py-4 bg-eclipse-green hover:bg-eclipse-green-light text-black font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(34,197,94,0.2)] hover:shadow-[0_0_30px_rgba(34,197,94,0.4)] active:scale-[0.98] tracking-wide">
            Connect Wallet
          </button>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleClaim}
              disabled={buttonDisabled}
              className={`w-full py-4 font-bold rounded-xl transition-all text-sm tracking-wide flex items-center justify-center gap-2
                ${buttonDisabled
                  ? 'bg-white/[0.03] text-white/30 border border-white/5 cursor-not-allowed'
                  : 'bg-eclipse-green hover:bg-eclipse-green-light text-black shadow-[0_0_20px_rgba(34,197,94,0.2)] hover:shadow-[0_0_30px_rgba(34,197,94,0.4)] active:scale-[0.98]'
                }
              `}
            >
              {buttonDisabled && <Lock className="w-4 h-4 opacity-50" />}
              {buttonLabel}
            </button>

            <button
              onClick={loadPosition}
              disabled={positionLoading || loading}
              className="w-full py-3.5 rounded-xl border border-white/[0.06] text-eclipse-text-muted hover:text-white hover:bg-white/[0.04] transition-all text-sm font-semibold flex items-center justify-center gap-2 group"
            >
              <RefreshCw className={`w-4 h-4 text-white/40 group-hover:text-white transition-colors ${positionLoading ? 'animate-spin' : ''}`} />
              Refresh Position
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProofLink({ label, signature, isTee }: { label: string; signature?: string; isTee?: boolean }) {
  if (!signature) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-eclipse-green/20 bg-eclipse-green/5 p-3 text-sm">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4 text-eclipse-green drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
        <span className="font-medium text-white/90">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {isTee ? (
          <a
            href={`https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-eclipse-green hover:text-eclipse-green-light transition-colors text-xs bg-eclipse-green/10 px-2 py-1 rounded-md hover:bg-eclipse-green/20"
          >
            View tx
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
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
