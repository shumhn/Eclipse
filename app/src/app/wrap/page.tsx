'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePhantom, useAccounts, AddressType } from '@phantom/react-sdk';
import {
  Zap,
  ArrowRight,
  Loader2,
  CheckCircle,
  AlertCircle,
  Wallet,
  ExternalLink,
  ArrowLeft,
  Shield,
  Coins,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { getBaseBalance, deposit, signAndSend, DEVNET_USDC_MINT, BASE_RPC_URL } from '@/lib/magicblock';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

export default function WrapPage() {
  const { isConnected } = usePhantom();
  const accounts = useAccounts();

  const [amount, setAmount] = useState('');
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Get the Solana address from connected accounts
  const solanaAccount = accounts?.find((a) => a.addressType === AddressType.solana);
  const walletAddress = solanaAccount?.address || '';

  const connection = new Connection(BASE_RPC_URL, 'confirmed');

  // Fetch base layer USDC balance
  const fetchBalance = useCallback(async () => {
    if (!walletAddress) return;

    setLoadingBalance(true);
    try {
      const userPubkey = new PublicKey(walletAddress);
      const usdcAta = await getAssociatedTokenAddress(new PublicKey(DEVNET_USDC_MINT), userPubkey);

      try {
        const accountInfo = await getAccount(connection, usdcAta);
        setUsdcBalance(Number(accountInfo.amount) / 1_000_000);
      } catch {
        setUsdcBalance(0);
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      setUsdcBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, [walletAddress, connection]);

  useEffect(() => {
    if (walletAddress) {
      fetchBalance();
    }
  }, [walletAddress, fetchBalance]);

  const handleDeposit = async () => {
    const phantom = (window as any).phantom?.solana;
    if (!walletAddress || !amount || parseFloat(amount) <= 0 || !phantom) {
      setError('Invalid amount or missing wallet capabilities');
      return;
    }

    if (usdcBalance !== null && parseFloat(amount) > usdcBalance) {
      setError('Insufficient base USDC balance');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const amountUsdc = parseFloat(amount);

      // 1. Get deposit transaction from MagicBlock API
      const res = await deposit(walletAddress, amountUsdc);

      if (!res.transactionBase64) {
        throw new Error('No transaction returned from MagicBlock');
      }

      // 2. Sign and send to Base Layer (deposits go to base RPC)
      const signature = await signAndSend(res.transactionBase64, (tx) => phantom.signTransaction(tx), { sendTo: 'base' });

      setSuccess(signature);
      setAmount('');
      setTimeout(fetchBalance, 2000);
    } catch (err: any) {
      console.error('Deposit failed:', err);
      setError(err.message || 'Failed to deposit to Ephemeral Vault');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-off-white">
      <Navbar />

      <main className="pt-24 pb-16 px-6">
        <div className="max-w-xl mx-auto">
          {/* Back Link */}
          <Link
            href="/markets"
            className="inline-flex items-center gap-2 text-dark/60 hover:text-dark mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Markets
          </Link>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl mb-4">
              <Zap className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="font-black text-4xl mb-2">Deposit to TEE Rollup</h1>
            <p className="text-dark/60">
              Legacy treasury flow. For most market trades, setup now happens from the market trade panel automatically.
            </p>
          </div>

          <div className="mb-6 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 shadow-[4px_4px_0px_0px_rgba(251,191,36,1)]">
            This page is no longer part of the primary prediction-market UX. Keep it only for low-level MagicBlock vault testing.
          </div>

          {/* Not Connected State */}
          {!isConnected && (
            <div className="bg-white border-2 border-dark rounded-2xl p-12 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center">
              <Wallet className="w-16 h-16 mx-auto mb-4 text-dark/40" />
              <h2 className="font-bold text-2xl mb-2">Connect Your Wallet</h2>
              <p className="text-dark/60 mb-6 max-w-md mx-auto">
                Connect your Phantom wallet to deposit USDC.
              </p>
            </div>
          )}

          {/* Connected - Deposit Form */}
          {isConnected && (
            <div className="bg-white border-2 border-dark rounded-2xl p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              {/* Token Flow Visualization */}
              <div className="flex items-center justify-center gap-4 py-6 mb-6 bg-gray-50 rounded-xl">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 border-2 border-blue-300 rounded-xl flex items-center justify-center mb-2 mx-auto">
                    <Coins className="w-8 h-8 text-blue-600" />
                  </div>
                  <span className="font-bold">Base USDC</span>
                  <p className="text-xs text-dark/50">Solana Devnet</p>
                </div>
                <ArrowRight className="w-8 h-8 text-dark/40" />
                <div className="text-center">
                  <div className="w-16 h-16 bg-emerald-100 border-2 border-emerald-500 rounded-xl flex items-center justify-center mb-2 mx-auto">
                    <Zap className="w-8 h-8 text-emerald-600" />
                  </div>
                  <span className="font-bold">Shielded USDC</span>
                  <p className="text-xs text-dark/50">Eclipse TEE</p>
                </div>
              </div>

              {/* Balance Display */}
              <div className="flex items-center justify-between mb-2">
                <label className="block font-bold">Amount (USDC)</label>
                <div className="text-sm text-dark/60">
                  {loadingBalance ? (
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                  ) : usdcBalance !== null ? (
                    <>
                      Balance: <span className="font-bold">{usdcBalance.toFixed(2)} USDC</span>
                    </>
                  ) : (
                    'Unable to fetch balance'
                  )}
                </div>
              </div>

              {/* Amount Input */}
              <div className="relative mb-4">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-4 rounded-xl border-2 border-dark bg-white
                    shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                    focus:outline-none focus:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]
                    focus:translate-x-[2px] focus:translate-y-[2px]
                    transition-all font-medium text-xl"
                  disabled={loading}
                />
                {usdcBalance !== null && usdcBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(usdcBalance.toString())}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 bg-dark/10 hover:bg-dark/20 rounded-lg text-sm font-bold transition-colors"
                  >
                    MAX
                  </button>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-xl">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="mb-4 p-4 bg-green-100 border border-green-300 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="font-bold text-green-700">USDC Deposited to Ephemeral Vault!</span>
                  </div>
                  <p className="text-xs text-green-600 mb-2">
                    You can now trade securely and privately on Eclipse TEE markets.
                  </p>
                  <a
                    href={`https://explorer.solana.com/tx/${success}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-800 bg-green-200 px-2 py-1 rounded inline-flex items-center gap-1 hover:bg-green-300 transition-colors"
                  >
                    View Transaction
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Deposit Button */}
              <Button
                variant="hero"
                size="xl"
                className="w-full bg-emerald-500 hover:bg-emerald-600"
                onClick={handleDeposit}
                disabled={loading || !amount || parseFloat(amount) <= 0}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Depositing...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Deposit to MagicBlock
                  </>
                )}
              </Button>

              {/* Privacy Notice */}
              <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <p className="text-xs text-emerald-800 text-center">
                  <Shield className="w-3 h-3 inline mr-1" />
                  <strong>TEE Shielded:</strong> Your balance in the Ephemeral Vault is fully composable but shielded until withdrawn.
                </p>
              </div>

              {/* Withdraw Link */}
              <div className="mt-4 text-center">
                <Link
                  href="/unwrap"
                  className="text-sm text-emerald-600 hover:underline inline-flex items-center gap-1"
                >
                  Need to withdraw from MagicBlock back to base layer?
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
