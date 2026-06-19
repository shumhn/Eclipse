'use client';

import Link from 'next/link';
import { Gift, Bookmark, Trophy } from 'lucide-react';
import { Market, calculatePriceFromReserves, isMarketActive } from '@/lib/api';
import CryptoIcon from '@/components/CryptoIcon';

interface MarketCardProps {
  market: Market;
  isTracked?: boolean;
}

export default function MarketCard({ market, isTracked = false }: MarketCardProps) {
  const positionsHidden = market.positionsHidden ?? false;
  const isPriceMarket = market.account.oracle_kind === 'pythPrice';
  const isSportsMarket = Boolean(market.sportsMarket);
  
  const prices = positionsHidden
    ? { yes: 0.5, no: 0.5 }
    : calculatePriceFromReserves(
        market.account.yes_token_supply_minted,
        market.account.no_token_supply_minted
      );
      
  const active = isMarketActive(market);

  const targetLabel = market.priceMarket?.targetPriceUsd != null
    ? market.priceMarket.targetPriceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : null;
    
  const asset = market.priceMarket?.asset ?? 'Unknown';
  // Use a cleaner arrow if available, else standard ↑/↓
  const direction = market.priceMarket?.direction === 'above' ? '↑' : '↓';

  // Capitalize the first letter for display
  const assetDisplay = isSportsMarket
    ? market.sportsMarket?.competition || 'World Cup'
    : asset === 'Unknown' ? 'General' :
    (asset.charAt(0).toUpperCase() + asset.slice(1).toLowerCase());

  return (
    <Link href={`/markets/${market.publicKey}`} className="block group">
      <div className={`
        bg-[#1c1e22] rounded-2xl p-5 flex flex-col
        transition-all duration-300 ease-out
        hover:bg-[#212429]
        ${!active ? 'opacity-60' : ''}
      `}>
        {/* Header: Icon + Question */}
        <div className="flex items-start gap-4 mb-6">
          <div className="shrink-0">
            {isSportsMarket ? (
              <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[6px] bg-yellow-500/15 text-yellow-400 shadow-sm">
                <Trophy className="h-5 w-5" aria-hidden="true" />
              </div>
            ) : (
              <CryptoIcon asset={asset === 'Unknown' ? 'SOL' : asset} size={42} />
            )}
          </div>
          <h3 className="font-medium text-white/95 text-[16px] leading-snug flex-1 pt-1">
            {market.account.question}
          </h3>
        </div>

        {/* Target and Odds Row */}
        <div className="flex items-center justify-between mb-6">
          {/* Target Price */}
          <div className="text-white font-normal text-[15px] flex items-center gap-2 tracking-wide">
            {isSportsMarket ? (
              <span className="text-gray-300">
                {market.sportsMarket?.homeTeam} vs {market.sportsMarket?.awayTeam}
              </span>
            ) : isPriceMarket && targetLabel ? (
              <>
                <span className="text-[#a1a1aa] text-[15px] -mt-0.5">{direction}</span>
                <span>{targetLabel}</span>
              </>
            ) : (
              <span className="text-gray-400 italic">Binary Event</span>
            )}
          </div>
          
          {/* Odds & Buttons */}
          <div className="flex items-center gap-4">
            {positionsHidden ? (
              <span className="font-bold text-white text-[15px] w-[42px] text-right">TEE</span>
            ) : (
              <span className="font-bold text-white text-[15px] w-[42px] text-right">
                {(prices.yes * 100).toFixed(0)}%
              </span>
            )}
            
            <div className="flex items-center gap-2">
              <div className="px-3 py-1 bg-[#1c3829] text-[#3ba767] rounded text-[13px] font-semibold transition-colors group-hover:bg-[#234533]">
                Yes
              </div>
              <div className="px-3 py-1 bg-[#3a1f24] text-[#df4c56] rounded text-[13px] font-semibold transition-colors group-hover:bg-[#47262c]">
                No
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${market.account.resolved ? 'bg-eclipse-green' : active ? 'bg-[#df4c56]' : 'bg-gray-500'}`} />
            <span className={`${market.account.resolved ? 'text-eclipse-green' : active ? 'text-[#df4c56]' : 'text-gray-500'} font-bold text-[12px] tracking-wider`}>
              {market.account.resolved ? 'RESOLVED' : active ? 'LIVE' : 'ENDED'}
            </span>
            <span className="text-[#8b949e] opacity-60 px-0.5">·</span>
            <span className="text-[#8b949e] text-[14px]">{assetDisplay}</span>
          </div>
          
          <div className="flex items-center gap-4 text-[#8b949e]">
            <Gift className="w-[18px] h-[18px] hover:text-white transition-colors" />
            <Bookmark className={`w-[18px] h-[18px] hover:text-white transition-colors ${isTracked ? 'fill-current text-white' : ''}`} />
          </div>
        </div>
      </div>
    </Link>
  );
}
