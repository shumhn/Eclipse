'use client';

import Link from 'next/link';
import { Clock, Shield, TrendingUp, Zap } from 'lucide-react';
import { Market, calculatePriceFromReserves, isMarketActive } from '@/lib/api';

interface MarketCardProps {
  market: Market;
  isTracked?: boolean;
}

export default function MarketCard({ market, isTracked = false }: MarketCardProps) {
  const positionsHidden = market.positionsHidden ?? false;
  const prices = positionsHidden
    ? { yes: 0.5, no: 0.5 }
    : calculatePriceFromReserves(
        market.account.yes_token_supply_minted,
        market.account.no_token_supply_minted
      );
  const active = isMarketActive(market);
  const tradingEnabled = market.tradingEnabled ?? true;

  // Parse volume (initial liquidity + minted supply if transparent)
  const baseLiquidity = parseInt(market.account.initial_liquidity, 16) / 1_000_000;
  const yesMinted = positionsHidden ? 0 : parseInt(market.account.yes_token_supply_minted, 16) / 1_000_000;
  const noMinted = positionsHidden ? 0 : parseInt(market.account.no_token_supply_minted, 16) / 1_000_000;
  const totalVol = baseLiquidity + yesMinted + noMinted;
  
  return (
    <Link href={`/markets/${market.publicKey}`} className="block h-full group">
      <div className={`
        bg-white/5 border border-white/10 rounded-2xl p-5 h-full flex flex-col
        transition-all duration-300 ease-out
        group-hover:bg-white/10 group-hover:border-white/20 group-hover:shadow-[0_8px_32px_rgba(43,168,89,0.05)]
        ${!active ? 'opacity-60 grayscale-[50%]' : ''}
      `}>
        {/* Category & Status */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs font-medium text-eclipse-text-muted">
            <span>Politics</span>
            <span className="text-white/20">•</span>
            <span className={`flex items-center gap-1 ${active ? 'text-white/80' : ''}`}>
              <Clock className="w-3 h-3" />
              {market.account.resolved ? 'Resolved' : active ? 'Active' : 'Ended'}
            </span>
          </div>
          {positionsHidden && (
            <div className="flex items-center gap-1.5 text-[10px] text-eclipse-green font-semibold bg-eclipse-green/10 border border-eclipse-green/20 px-2.5 py-1 rounded-full shadow-[0_0_10px_rgba(43,168,89,0.1)]">
              <Shield className="w-3 h-3" /> TEE
            </div>
          )}
          {!positionsHidden && active && tradingEnabled && (
            <div className="flex items-center gap-1.5 text-[10px] text-eclipse-blue font-semibold bg-eclipse-blue/10 border border-eclipse-blue/20 px-2.5 py-1 rounded-full">
              <Zap className="w-3 h-3" /> TEE
            </div>
          )}
        </div>

        {/* Question */}
        <h3 className="font-light text-white text-lg leading-snug mb-6 flex-1 group-hover:text-white transition-colors">
          {market.account.question}
        </h3>

        {/* Odds Area */}
        {positionsHidden ? (
           <div className="flex items-center justify-between mt-auto bg-[#030608]/50 border border-white/5 rounded-xl px-4 py-3 group-hover:border-eclipse-green/20 transition-colors">
             <div className="text-eclipse-green text-sm font-medium flex items-center gap-2">
               <Shield className="h-4 w-4" /> 
               <span className="tracking-wide">Shielded Odds</span>
             </div>
             <div className="text-xs font-medium px-4 py-1.5 bg-white/5 border border-white/10 text-white rounded-lg group-hover:bg-eclipse-green group-hover:text-black group-hover:border-eclipse-green transition-all duration-300">
               Trade
             </div>
           </div>
        ) : (
          <div className="flex items-center gap-3 mt-auto">
            <div className="flex-1 flex flex-col items-center justify-center bg-eclipse-green/5 border border-eclipse-green/10 rounded-xl p-3 group-hover:bg-eclipse-green/10 group-hover:border-eclipse-green/30 transition-all duration-300">
              <div className="text-eclipse-green text-sm font-semibold tracking-wide">Yes {(prices.yes * 100).toFixed(0)}¢</div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center bg-eclipse-red/5 border border-eclipse-red/10 rounded-xl p-3 group-hover:bg-eclipse-red/10 group-hover:border-eclipse-red/30 transition-all duration-300">
              <div className="text-eclipse-red text-sm font-semibold tracking-wide">No {(prices.no * 100).toFixed(0)}¢</div>
            </div>
          </div>
        )}

        {/* Footer info (Volume) */}
        <div className="flex items-center justify-between text-xs text-eclipse-text-muted mt-5 pt-4 border-t border-white/5">
          <div className="flex items-center gap-1.5 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>${totalVol.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Vol.</span>
          </div>
          <div className="font-mono text-[10px] opacity-70">
            {market.account.creator.slice(0, 4)}...{market.account.creator.slice(-4)}
          </div>
        </div>
      </div>
    </Link>
  );
}
