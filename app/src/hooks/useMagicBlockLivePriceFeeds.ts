'use client';

import { useEffect, useState } from 'react';
import { Connection, PublicKey, type AccountInfo } from '@solana/web3.js';
import { fetchLivePriceFeeds, type LivePriceFeed } from '@/lib/api';
import { SUPPORTED_PRICE_FEEDS } from '@/lib/priceFeeds';

const MAGICBLOCK_ER_RPC_URL = 'https://devnet.magicblock.app';
const MAGICBLOCK_ER_WS_URL = 'wss://devnet.magicblock.app';
const PYTH_LAZER_PRICE_OFFSET = 73;
const FALLBACK_POLL_MS = 3_000;

const INITIAL_FEEDS: LivePriceFeed[] = SUPPORTED_PRICE_FEEDS.map((feed) => ({
  ...feed,
  currentPriceUsd: null,
  publishTime: null,
}));

export function useMagicBlockLivePriceFeeds(enabled: boolean) {
  const [feeds, setFeeds] = useState<LivePriceFeed[]>(INITIAL_FEEDS);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'magicblock' | 'hermes' | 'connecting'>('connecting');

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let fallbackInterval: number | null = null;
    const connection = new Connection(MAGICBLOCK_ER_RPC_URL, {
      wsEndpoint: MAGICBLOCK_ER_WS_URL,
    });
    const subscriptions: number[] = [];

    const mergeFeeds = (incomingFeeds: LivePriceFeed[]) => {
      setFeeds((currentFeeds) =>
        currentFeeds.map((feed) => incomingFeeds.find((incoming) => incoming.symbol === feed.symbol) || feed)
      );
    };

    const loadFallbackPrices = async () => {
      try {
        setLoading(true);
        const latestFeeds = await fetchLivePriceFeeds();
        if (!cancelled && latestFeeds.length > 0) {
          mergeFeeds(latestFeeds);
          setSource((currentSource) => (currentSource === 'magicblock' ? currentSource : 'hermes'));
        }
      } catch {
        // Keep the websocket/static data visible if Hermes fallback hiccups.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const updateFeedFromAccount = (feed: LivePriceFeed, accountInfo: AccountInfo<Buffer> | null) => {
      const price = parsePythLazerPrice(accountInfo?.data, feed.exponent);
      if (price === null || cancelled) return;

      setFeeds((currentFeeds) =>
        currentFeeds.map((currentFeed) =>
          currentFeed.symbol === feed.symbol
            ? {
                ...currentFeed,
                currentPriceUsd: price,
                publishTime: Math.floor(Date.now() / 1000),
              }
            : currentFeed
        )
      );
      setSource('magicblock');
      setLoading(false);
    };

    const subscribe = async () => {
      setSource('connecting');
      await loadFallbackPrices();

      for (const feed of INITIAL_FEEDS) {
        const feedAddress = new PublicKey(feed.magicBlockFeed);
        const subscriptionId = connection.onAccountChange(
          feedAddress,
          (accountInfo) => updateFeedFromAccount(feed, accountInfo as AccountInfo<Buffer>),
          'confirmed'
        );
        subscriptions.push(subscriptionId);

        connection
          .getAccountInfo(feedAddress, 'confirmed')
          .then((accountInfo) => updateFeedFromAccount(feed, accountInfo as AccountInfo<Buffer> | null))
          .catch(() => {});
      }

      fallbackInterval = window.setInterval(loadFallbackPrices, FALLBACK_POLL_MS);
    };

    subscribe().catch(() => {
      if (!cancelled) {
        setSource('hermes');
        fallbackInterval = window.setInterval(loadFallbackPrices, FALLBACK_POLL_MS);
      }
    });

    return () => {
      cancelled = true;
      if (fallbackInterval !== null) window.clearInterval(fallbackInterval);
      for (const subscriptionId of subscriptions) {
        connection.removeAccountChangeListener(subscriptionId).catch(() => {});
      }
    };
  }, [enabled]);

  return { feeds, loading, source };
}

function parsePythLazerPrice(data: Uint8Array | Buffer | undefined, exponent: number): number | null {
  if (!data || data.length < PYTH_LAZER_PRICE_OFFSET + 8) return null;

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawPrice = view.getBigInt64(PYTH_LAZER_PRICE_OFFSET, true);

  return Number(rawPrice) * Math.pow(10, exponent);
}
