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
import { getPrivateBalance, withdraw, signAndSend, fetchTeeAuthToken } from '@/lib/magicblock';
import { PublicKey } from '@solana/web3.js';

export default function UnwrapPage() {
  const { isConnected } = usePhantom();
  const accounts = useAccounts();

  const [amount, setAmount] = useState('');
  const [shieldedBalance, setShieldedBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Get the Solana address from connected accounts
  const solanaAccount = accounts?.find((a) => a.addressType === AddressType.solana);
  const walletAddress = solanaAccount?.address || '';

  const getOrFetchAuthToken = useCallback(async () => {
    if (authToken) return authToken;
    const phantom = (window as any).phantom?.solana;
    if (!walletAddress || !phantom) throw new Error("Wallet not fully connected");

    const token = await fetchTeeAuthToken(new PublicKey(walletAddress), async (msg: Uint8Array) => (await phantom.signMessage(msg, 'utf8')).signature);
    setAuthToken(token);
    return token;
  }, [walletAddress, authToken]);

  // Fetch shielded USDC balance (requires auth token)
  const fetchBalance = useCallback(async () => {
    if (!walletAddress) return;

    setLoadingBalance(true);
    try {
      const token = await getOrFetchAuthToken();
      const res = await getPrivateBalance(walletAddress, token);
      setShieldedBalance(Number(res.balance) / 1_000_000);
    } catch (err) {
      console.error('Failed to fetch private balance:', err);
      // It's normal to fail if user hasn't deposited yet or token expired
      setShieldedBalance(0);
    } finally {
      setLoadingBalance(false);
    }
  }, [walletAddress, getOrFetchAuthToken]);

  useEffect(() => {
    if (walletAddress) {
      fetchBalance();
    }
  }, [walletAddress, fetchBalance]);

  const handleWithdraw = async () => {
    const phantom = (window as any).phantom?.solana;
    if (!walletAddress || !amount || parseFloat(amount) <= 0 || !phantom) {
      setError('Invalid amount or missing wallet capabilities');
      return;
    }

    if (shieldedBalance !== null && parseFloat(amount) > shieldedBalance) {
      setError('Insufficient shielded USDC balance');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const amountUsdc = parseFloat(amount);
      const token = await getOrFetchAuthToken();

      // 1. Get withdraw transaction from MagicBlock API
      const res = await withdraw(walletAddress, amountUsdc, token);

      if (!res.transactionBase64) {
        throw new Error('No transaction returned from MagicBlock');
      }

      // 2. Sign and send to Ephemeral Rollup RPC
      const signature = await signAndSend(res.transactionBase64, (tx) => phantom.signTransaction(tx), { sendTo: 'ephemeral' });

      setSuccess(signature);
      setAmount('');
      setTimeout(fetchBalance, 2000);
    } catch (err: any) {
      console.error('Withdraw failed:', err);
      setError(err.message || 'Failed to withdraw from Ephemeral Vault');
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
            href="/wrap"
            className="inline-flex items-center gap-2 text-dark/60 hover:text-dark mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Deposit
          </Link>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-4">
              <Coins className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="font-black text-4xl mb-2">Withdraw from TEE</h1>
            <p className="text-dark/60">
              Legacy treasury flow for low-level testing. Resolved market payouts are not using this page yet.
            </p>
          </div>

          <div className="mb-6 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 shadow-[4px_4px_0px_0px_rgba(251,191,36,1)]">
            The prediction-market app is currently focused on market creation, private trading, and PER settlement.
            Final L1 claim/withdraw UX is still being finished.
          </div>

          {/* Not Connected State */}
          {!isConnected && (
            <div className="bg-white border-2 border-dark rounded-2xl p-12 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center">
              <Wallet className="w-16 h-16 mx-auto mb-4 text-dark/40" />
              <h2 className="font-bold text-2xl mb-2">Connect Your Wallet</h2>
              <p className="text-dark/60 mb-6 max-w-md mx-auto">
                Connect your Phantom wallet to withdraw your USDC.
              </p>
            </div>
          )}

          {/* Connected - Withdraw Form */}
          {isConnected && (
            <div className="bg-white border-2 border-dark rounded-2xl p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              {/* Token Flow Visualization */}
              <div className="flex items-center justify-center gap-4 py-6 mb-6 bg-gray-50 rounded-xl">
                <div className="text-center">
                  <div className="w-16 h-16 bg-emerald-100 border-2 border-emerald-500 rounded-xl flex items-center justify-center mb-2 mx-auto">
                    <Zap className="w-8 h-8 text-emerald-600" />
                  </div>
                  <span className="font-bold">Shielded USDC</span>
                  <p className="text-xs text-dark/50">MagicBlock TEE</p>
                </div>
                <ArrowRight className="w-8 h-8 text-dark/40" />
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 border-2 border-blue-300 rounded-xl flex items-center justify-center mb-2 mx-auto">
                    <Coins className="w-8 h-8 text-blue-600" />
                  </div>
                  <span className="font-bold">Base USDC</span>
                  <p className="text-xs text-dark/50">Solana Devnet</p>
                </div>
              </div>

              {/* Balance Display */}
              <div className="flex items-center justify-between mb-2">
                <label className="block font-bold">Amount (USDC)</label>
                <div className="text-sm text-dark/60">
                  {loadingBalance ? (
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                  ) : shieldedBalance !== null ? (
                    <>
                      Available: <span className="font-bold">{shieldedBalance.toFixed(2)} USDC</span>
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
                {shieldedBalance !== null && shieldedBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(shieldedBalance.toString())}
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
                    <span className="font-bold text-green-700">Withdrawal Successful!</span>
                  </div>
                  <p className="text-xs text-green-600 mb-2">
                    Your USDC has been moved back to the Solana base layer.
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

              {/* Withdraw Button */}
              <Button
                variant="hero"
                size="xl"
                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                onClick={handleWithdraw}
                disabled={loading || !amount || parseFloat(amount) <= 0}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Withdrawing...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-5 h-5 mr-2" />
                    Withdraw to Solana
                  </>
                )}
              </Button>

              {/* Notice */}
              <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-xs text-blue-800 text-center">
                  <Coins className="w-3 h-3 inline mr-1" />
                  Once withdrawn, your USDC will be visible on the public Solana ledger.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
