"use client";

import { useState, useEffect, useCallback } from "react";
import { usePhantom, useConnect, useDisconnect, useAccounts, useIsExtensionInstalled, AddressType } from "@phantom/react-sdk";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { ChevronDown, ExternalLink, RefreshCw, Coins, Zap } from "lucide-react";
import { getBaseBalance, getPrivateBalance, getOrFetchTeeAuthToken } from "@/lib/magicblock";

const RPC_URL = "https://api.devnet.solana.com";

interface WalletBalances {
  sol: number;
  usdc: number;
  shieldedUsdc: number | null; // Null if not initialized/auth failed
  loading: boolean;
}

/**
 * Phantom Wallet Button - Shows balances and faucet links
 */
export function PhantomWalletButton() {
  const { isConnected } = usePhantom();
  const { isInstalled, isLoading: isCheckingExtension } = useIsExtensionInstalled();
  const { connect, isConnecting, error: connectError } = useConnect();
  const { disconnect, isDisconnecting } = useDisconnect();
  const accounts = useAccounts();

  const [balances, setBalances] = useState<WalletBalances>({
    sol: 0,
    usdc: 0,
    shieldedUsdc: null,
    loading: false
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const [collateralMint, setCollateralMint] = useState<string | null>(null);

  // Get Solana address
  const solanaAccount = accounts?.find((a) => a.addressType === AddressType.solana);
  const address = solanaAccount?.address || "";
  const shortAddress = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "";

  // Fetch TEE Auth token if needed
  const getOrFetchAuthToken = useCallback(async () => {
    const phantom = (window as any).phantom?.solana;
    if (!address || !phantom) return null;

    try {
      const token = await getOrFetchTeeAuthToken(new PublicKey(address), async (msg: Uint8Array) => {
        const { signature } = await phantom.signMessage(msg, 'utf8');
        return signature;
      });
      return token;
    } catch (e) {
      console.error("Failed to authenticate with TEE:", e);
      return null;
    }
  }, [address]);

  useEffect(() => {
    let cancelled = false;

    const loadProtocolConfig = async () => {
      try {
        const response = await fetch('/api/config');
        const json = await response.json();
        if (!cancelled && json?.success && json?.data?.collateralMint) {
          setCollateralMint(json.data.collateralMint);
        }
      } catch (error) {
        console.error('Failed to fetch protocol config:', error);
      }
    };

    loadProtocolConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    if (!address || !collateralMint) return;

    setBalances(prev => ({ ...prev, loading: true }));

    try {
      const connection = new Connection(RPC_URL);
      const publicKey = new PublicKey(address);

      // Fetch SOL balance
      const solBalance = await connection.getBalance(publicKey);

      // Fetch USDC balance
      let usdcBalance = 0;
      try {
        const usdcAta = await getAssociatedTokenAddress(new PublicKey(collateralMint), publicKey);
        const accountInfo = await getAccount(connection, usdcAta);
        usdcBalance = Number(accountInfo.amount) / 1_000_000; // 6 decimals
      } catch {
        // Token account doesn't exist - balance is 0
      }

      // Fetch MagicBlock Shielded USDC balance
      let shieldedUsdc: number | null = null;
      try {
        const token = await getOrFetchAuthToken();
        if (token) {
          const res = await getPrivateBalance(address, token);
          shieldedUsdc = Number(res.balance) / 1_000_000;
        }
      } catch {
        // Account doesn't exist or unauthorized
        shieldedUsdc = 0;
      }

      setBalances({
        sol: solBalance / LAMPORTS_PER_SOL,
        usdc: usdcBalance,
        shieldedUsdc,
        loading: false,
      });
    } catch (error) {
      console.error("Error fetching balances:", error);
      setBalances(prev => ({ ...prev, loading: false }));
    }
  }, [address, collateralMint, getOrFetchAuthToken]);

  // Fetch balances when connected
  useEffect(() => {
    if (isConnected && address && collateralMint) {
      fetchBalances();
      // Refresh every 30 seconds
      const interval = setInterval(fetchBalances, 30000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address, collateralMint, fetchBalances]);

  // Handle connection
  const handleConnect = async () => {
    try {
      await connect({ provider: "injected" });
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
  };

  // Loading state
  if (isCheckingExtension) {
    return (
      <button
        disabled
        className="bg-dark/50 text-white rounded-3xl px-6 py-3 text-sm font-bold border-2 border-dark/50"
      >
        Checking...
      </button>
    );
  }

  // Extension not installed
  if (!isInstalled) {
    return (
      <a
        href="https://phantom.app/download"
        target="_blank"
        rel="noopener noreferrer"
        className="bg-neon-purple text-white rounded-3xl px-6 py-3 text-sm font-bold border-2 border-dark shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 inline-block"
      >
        Install Phantom
      </a>
    );
  }

  // Connected state
  if (isConnected && accounts && accounts.length > 0) {
    return (
      <div className="relative">
        <div className="flex items-center gap-3">
          {/* Balance Display */}
          <div className="hidden md:flex items-center gap-3 text-xs font-mono bg-white/5 px-4 py-2 rounded-full border border-white/10 text-gray-300">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
              {balances.loading ? "..." : `${balances.sol.toFixed(2)} SOL`}
            </span>
            <span className="text-white/20">|</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-eclipse-green shadow-[0_0_8px_rgba(43,168,89,0.8)]" />
              {balances.loading ? "..." : `${balances.usdc.toFixed(2)} USDC`}
            </span>
          </div>

          {/* Wallet Address Button */}
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 text-sm font-mono bg-white/5 px-4 py-2 rounded-full border border-white/10 text-white hover:bg-white/10 transition-colors"
          >
            {shortAddress}
            <ChevronDown className={`w-4 h-4 transition-transform text-gray-400 ${showDropdown ? 'rotate-180' : ''}`} />
          </button>


        </div>

        {/* Dropdown Menu */}
        {showDropdown && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-[#030608]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
            {/* Balance Section */}
            <div className="p-4 border-b border-eclipse-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-eclipse-text-main">Balances (Devnet)</span>
                <button
                  onClick={fetchBalances}
                  disabled={balances.loading}
                  className="p-1 hover:bg-white/10 rounded-lg text-eclipse-text-muted"
                >
                  <RefreshCw className={`w-4 h-4 ${balances.loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-eclipse-text-muted text-sm flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gradient-to-r from-[#22c55e] to-[#4ade80]" />
                    SOL
                  </span>
                  <span className="font-medium text-eclipse-text-main">{balances.sol.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-eclipse-text-muted text-sm flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    USDC (Devnet)
                  </span>
                  <span className="font-medium text-eclipse-text-main">{balances.usdc.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Shielded USDC Section */}
            <div className="p-4 border-b border-eclipse-border bg-eclipse-green/5">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-eclipse-green" />
                <span className="text-sm font-bold text-eclipse-text-main">Shielded USDC</span>
              </div>
              {balances.shieldedUsdc !== null ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-eclipse-text-muted text-xs flex items-center gap-1">
                      MagicBlock TEE
                    </span>
                    <span className="font-bold text-eclipse-green">
                      {balances.shieldedUsdc.toFixed(2)} USDC
                    </span>
                  </div>
                  <p className="text-xs text-eclipse-text-muted">
                    Trade privately with 0 latency on Ephemeral Rollups.
                  </p>
                </div>
              ) : (
                <div className="text-xs text-eclipse-text-muted">
                  <p>No Shielded USDC available.</p>
                  <p className="mt-1 text-eclipse-green">Deposit USDC to start trading privately.</p>
                </div>
              )}
            </div>

            {/* Faucet Links */}
            <div className="p-4">
              <span className="text-xs font-bold text-eclipse-text-muted uppercase mb-2 block">Get Devnet Tokens</span>
              <div className="space-y-2">
                <a
                  href="https://faucet.solana.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 text-sm transition-colors text-eclipse-text-main"
                >
                  <Coins className="w-4 h-4 text-[#22c55e]" />
                  <span>SOL Faucet</span>
                  <ExternalLink className="w-3 h-3 ml-auto text-eclipse-text-muted" />
                </a>
                <a
                  href="https://faucet.circle.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 text-sm transition-colors text-eclipse-text-main"
                >
                  <Coins className="w-4 h-4 text-green-500" />
                  <span>USDC Devnet Faucet</span>
                  <ExternalLink className="w-3 h-3 ml-auto text-eclipse-text-muted" />
                </a>
              </div>
            </div>

            {/* Explorer Link & Disconnect */}
            <div className="p-4 pt-0 space-y-2">
              <a
                href={`https://solscan.io/account/${address}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors text-eclipse-text-main"
              >
                <span>View on Explorer</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => {
                  disconnect();
                  setShowDropdown(false);
                }}
                disabled={isDisconnecting}
                className="w-full flex items-center justify-center p-2.5 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 transition-colors disabled:opacity-50"
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect Wallet"}
              </button>
            </div>
          </div>
        )}

        {/* Click outside to close */}
        {showDropdown && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
        )}
      </div>
    );
  }

  // Disconnected state
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="px-6 py-2.5 bg-white/5 text-white font-light text-sm rounded-full border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
      >
        {isConnecting ? "Connecting..." : "Connect Phantom"}
      </button>
      {connectError && (
        <span className="text-xs text-red-400 mt-1">{connectError.message}</span>
      )}
    </div>
  );
}
