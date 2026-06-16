'use client';

import { useState } from 'react';
import { Market, formatUsdPrice, formatTimestamp } from '@/lib/api';

interface RulesSectionProps {
  market: Market;
  isPriceMarket: boolean;
  direction: string;
  targetPrice: number | null;
  priceRule: string;
  createdDate: Date;
}

export default function RulesSection({
  market,
  isPriceMarket,
  direction,
  targetPrice,
  priceRule,
  createdDate,
}: RulesSectionProps) {
  const [activeTab, setActiveTab] = useState<'rules' | 'context'>('rules');

  const asset = market.priceMarket?.asset ?? 'BTC';
  const endDate = formatTimestamp(market.account.end_time);
  const formattedTarget = formatUsdPrice(targetPrice);

  const endDateStr = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const endTimeStr = endDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className="bg-white/[0.03] rounded-xl ring-1 ring-white/[0.06] overflow-hidden">
      {/* Tabs */}
      <div className="flex gap-6 px-6 pt-5 pb-0">
        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-3 font-bold text-sm tracking-wide transition-all relative ${
            activeTab === 'rules' ? 'text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Rules
          {activeTab === 'rules' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#60a5fa] to-[#93c5fd]" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('context')}
          className={`pb-3 font-bold text-sm tracking-wide transition-all relative ${
            activeTab === 'context' ? 'text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Market Context
          {activeTab === 'context' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#60a5fa] to-[#93c5fd]" />
          )}
        </button>
      </div>

      {/* Separator */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      {/* Content */}
      <div className="p-6">
        {activeTab === 'rules' ? (
          <div className="space-y-5 text-sm text-white/70 leading-relaxed">
            {isPriceMarket ? (
              <>
                <p>
                  This market will resolve to &quot;Yes&quot; if the{' '}
                  <span className="text-white font-medium">Pyth Network</span> price feed for{' '}
                  <span className="text-white font-medium">{asset}/USD</span> reports a price{' '}
                  <span className="text-white font-medium">{direction}</span>{' '}
                  <span className="text-white font-medium">{formattedTarget}</span> at the resolution
                  timestamp of{' '}
                  <span className="text-white font-medium">{endDateStr}, {endTimeStr}</span>.
                  Otherwise, this market will resolve to &quot;No.&quot;
                </p>
                <p>
                  The resolution source for this market is the on-chain{' '}
                  <a
                    href="https://pyth.network/price-feeds"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#60a5fa] hover:text-[#93c5fd] transition-colors underline underline-offset-2"
                  >
                    Pyth Network
                  </a>{' '}
                  oracle, which provides real-time, tamper-proof price data directly on Solana. The oracle
                  is cranked automatically when the market&apos;s end time is reached.
                </p>
                <p>
                  Please note that the outcome of this market depends solely on the Pyth {asset}/USD price
                  feed at the exact resolution timestamp. Prices from other oracles, exchanges, or off-chain
                  sources will not be considered for the resolution of this market.
                </p>
              </>
            ) : (
              <p>
                This market resolves according to its configured on-chain oracle outcome at the end date
                ({endDateStr}, {endTimeStr}). The result is determined programmatically when the
                resolution timestamp is reached.
              </p>
            )}
            <p className="text-white/50 text-xs">
              <span className="text-white/70 font-semibold">Market Opened:</span>{' '}
              {createdDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              ,{' '}
              {createdDate.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZoneName: 'short',
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-5 text-sm text-white/70 leading-relaxed">
            {isPriceMarket ? (
              <>
                <p>
                  This is a price prediction market for{' '}
                  <span className="text-white font-medium">{asset}</span>. Traders are betting on whether
                  the price will be <span className="text-white font-medium">{direction}</span>{' '}
                  <span className="text-white font-medium">{formattedTarget}</span> by{' '}
                  <span className="text-white font-medium">{endDateStr}, {endTimeStr}</span>.
                </p>
                <p>
                  The market uses <span className="text-white font-medium">Pyth Network</span> price feeds for
                  real-time price tracking and resolution. The oracle provides tamper-proof, high-fidelity pricing data
                  directly on-chain with sub-second updates.
                </p>
                {market.positionsHidden && (
                  <p>
                    All trades are executed inside{' '}
                    <span className="text-white font-medium">MagicBlock&apos;s Ephemeral Rollup</span> (TEE),
                    ensuring that positions remain private until the market resolves. This prevents front-running
                    and whale manipulation.
                  </p>
                )}
                <p>
                  The market was created with{' '}
                  <span className="text-white font-medium">
                    ${(parseInt(market.account.initial_liquidity, 16) / 1_000_000).toFixed(0)} USDC
                  </span>{' '}
                  of initial liquidity and uses an automated market maker (AMM) for continuous price discovery.
                </p>
              </>
            ) : (
              <p>
                This market uses an on-chain oracle for resolution. The outcome is determined programmatically
                when the resolution timestamp is reached on {endDateStr} at {endTimeStr}.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
