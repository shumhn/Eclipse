"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js";
import {
  PRICE_FEED_BY_ASSET,
  type PriceFeedAsset,
} from "@/lib/priceFeeds";

const MAGICBLOCK_ER_RPC_URL = "https://devnet.magicblock.app";
const MAGICBLOCK_ER_WS_URL = "wss://devnet.magicblock.app";
const PYTH_LAZER_PROGRAM_ID = new PublicKey(
  "PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd",
);
const PYTH_LAZER_PRICE_OFFSET = 73;
const DEFAULT_CHART_HEIGHT = 300;
const MIN_CHART_HEIGHT = 220;
const MAX_CHART_HEIGHT = 320;

interface PriceChartProps {
  asset: PriceFeedAsset | "Unknown";
  targetPriceUsd: number | null;
  direction?: "above" | "below";
  resolutionTimestamp?: number;
}

function getAssetColor(asset: string): { line: string; top: string; bottom: string } {
  const normalizedAsset = (asset || '').toUpperCase();
  if (normalizedAsset.includes('BTC') || normalizedAsset.includes('BITCOIN')) {
    return {
      line: "#F7931A",
      top: "rgba(247, 147, 26, 0.4)",
      bottom: "rgba(247, 147, 26, 0.0)",
    };
  }
  if (normalizedAsset.includes('ETH') || normalizedAsset.includes('ETHEREUM')) {
    return {
      line: "#627EEA",
      top: "rgba(98, 126, 234, 0.4)",
      bottom: "rgba(98, 126, 234, 0.0)",
    };
  }
  if (normalizedAsset.includes('SOL') || normalizedAsset.includes('SOLANA')) {
    return {
      line: "#14F195",
      top: "rgba(20, 241, 149, 0.4)",
      bottom: "rgba(20, 241, 149, 0.0)",
    };
  }
  if (normalizedAsset.includes('JUP') || normalizedAsset.includes('JUPITER')) {
    return {
      line: "#00BEF0",
      top: "rgba(0, 190, 240, 0.4)",
      bottom: "rgba(0, 190, 240, 0.0)",
    };
  }
  if (normalizedAsset.includes('DOGE') || normalizedAsset.includes('DOGECOIN')) {
    return {
      line: "#C3A634",
      top: "rgba(195, 166, 52, 0.4)",
      bottom: "rgba(195, 166, 52, 0.0)",
    };
  }
  return {
    line: "#3b82f6",
    top: "rgba(59, 130, 246, 0.4)",
    bottom: "rgba(59, 130, 246, 0.0)",
  };
}

function PriceChartInner({
  asset,
  targetPriceUsd,
  direction = "above",
  resolutionTimestamp,
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const livePriceRef = useRef<HTMLSpanElement>(null);
  const diffPriceRef = useRef<HTMLSpanElement>(null);
  const chartRef = useRef<any>(null);
  const areaSeriesRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [streamSource, setStreamSource] = useState<"magicblock" | "hermes" | "connecting">("connecting");
  const [updateCount, setUpdateCount] = useState(0);
  const lastTimeRef = useRef(0);

  // One-time chart creation
  useEffect(() => {
    if (asset === "Unknown" || !chartContainerRef.current) return;

    let destroyed = false;
    let resizeObserver: ResizeObserver | null = null;

    const getChartSize = () => {
      const rect = chartContainerRef.current?.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect?.width || 0));
      const measuredHeight = Math.floor(rect?.height || DEFAULT_CHART_HEIGHT);
      const height = Math.min(
        MAX_CHART_HEIGHT,
        Math.max(MIN_CHART_HEIGHT, measuredHeight || DEFAULT_CHART_HEIGHT),
      );
      return { width, height };
    };

    import("lightweight-charts").then((lc) => {
      if (destroyed || !chartContainerRef.current) return;
      const { width, height } = getChartSize();

      const chart = lc.createChart(chartContainerRef.current, {
        width,
        height,
        layout: {
          background: { color: "transparent" },
          textColor: "#7C858E",
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: true, // Enable seconds for high-frequency feel
          tickMarkFormatter: (time: number) => {
            const date = new Date(time * 1000);
            return date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
          },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { width: 1, color: "#2C3137", style: 0 },
          horzLine: { width: 1, color: "#2C3137", style: 0 },
        },
      });

      // Use AreaSeries instead of LineSeries for that beautiful glowing look
      const colors = getAssetColor(asset);
      const areaSeries = chart.addSeries(lc.AreaSeries, {
        lineColor: colors.line,
        topColor: colors.top,
        bottomColor: colors.bottom,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: false,
      });

      if (targetPriceUsd) {
        areaSeries.createPriceLine({
          price: targetPriceUsd,
          color: "#7C858E",
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Target",
        });
      }

      chartRef.current = chart;
      areaSeriesRef.current = areaSeries;

      resizeObserver = new ResizeObserver(() => {
        if (chartContainerRef.current && !destroyed) {
          chart.applyOptions(getChartSize());
        }
      });
      resizeObserver.observe(chartContainerRef.current);

      setReady(true);
    });

    return () => {
      destroyed = true;
      resizeObserver?.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        areaSeriesRef.current = null;
      }
      setReady(false);
    };
  }, [asset, targetPriceUsd, direction]);

  // Data fetching and MagicBlock ER websocket stream
  useEffect(() => {
    if (!ready || !areaSeriesRef.current || asset === "Unknown") return;

    const abortController = new AbortController();
    const signal = abortController.signal;
    const selectedFeed = PRICE_FEED_BY_ASSET[asset];
    const symbol = selectedFeed.tradingViewSymbol;
    const feedId = selectedFeed.hermesFeedId;
    const areaSeries = areaSeriesRef.current;
    let eventSource: EventSource | null = null;
    let connection: Connection | null = null;
    let accountSubscriptionId: number | null = null;
    let isStreamActive = true;
    setStreamSource("connecting");
    setUpdateCount(0);

    const updateLivePriceText = (price: number, source: "magicblock" | "hermes") => {
      if (livePriceRef.current) {
        livePriceRef.current.innerText = `$${price.toLocaleString(undefined, {
          minimumFractionDigits: 2,
        })}`;
        const colors = getAssetColor(asset);
        livePriceRef.current.style.color = colors.line;

        if (targetPriceUsd && diffPriceRef.current) {
          const diff = Math.abs(price - targetPriceUsd);
          const arrow = price >= targetPriceUsd ? "▴" : "▾";
          diffPriceRef.current.innerText = `${arrow} $${diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          diffPriceRef.current.style.color = colors.line;
        }
      }

      setStreamSource(source);
    };

    const pushLivePrice = (price: number, source: "magicblock" | "hermes") => {
      updateLivePriceText(price, source);

      const now = Date.now() / 1000;
      const nextTime = now > lastTimeRef.current ? now : lastTimeRef.current + 0.001;
      areaSeries.update({ time: nextTime as any, value: price });
      lastTimeRef.current = nextTime;
      setUpdateCount((count) => count + 1);
      chartRef.current?.timeScale().scrollToRealTime();

      const colors = getAssetColor(asset);
      areaSeries.applyOptions({
        lineColor: colors.line,
        topColor: colors.top,
        bottomColor: colors.bottom,
      });
    };

    const fetchHistory = async () => {
      try {
        const to = Math.floor(Date.now() / 1000);
        // Fetch only the last 3 hours instead of 24h, so the chart moves noticeably!
        const from = to - 3600 * 3;
        const res = await fetch(
          `https://benchmarks.pyth.network/v1/shims/tradingview/history?symbol=${symbol}&resolution=1&from=${from}&to=${to}`,
          { signal },
        );
        const json = await res.json();

        if (json.s === "ok" && !signal.aborted) {
          const uniqueData = new Map<number, number>();
          for (let i = 0; i < json.t.length; i++) {
            uniqueData.set(json.t[i], json.c[i]);
          }
          const chartData = Array.from(uniqueData.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([timestamp, value]) => ({
              time: timestamp as any,
              value,
            }));

          if (chartData.length > 0) {
            areaSeries.setData(chartData);
            chartRef.current?.timeScale().fitContent();
            lastTimeRef.current = chartData[chartData.length - 1].time;
            updateLivePriceText(chartData[chartData.length - 1].value, "hermes");
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch pyth history", err);
        }
      }
    };

    const setupHermesFallbackStream = () => {
      if (!isStreamActive) return;
      setStreamSource("hermes");
      eventSource = new EventSource(
        `https://hermes.pyth.network/v2/updates/price/stream?ids[]=${feedId}`,
      );

      eventSource.onmessage = (event) => {
        if (!isStreamActive || signal.aborted) {
          eventSource?.close();
          return;
        }

        try {
          const json = JSON.parse(event.data);
          if (json.parsed && json.parsed.length > 0) {
            const priceData = json.parsed[0].price;
            const actualPrice =
              Number(priceData.price) * Math.pow(10, priceData.expo);

            pushLivePrice(actualPrice, "hermes");
          }
        } catch (err) {
          // ignore stream parse errors
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        if (isStreamActive && !signal.aborted) {
          setTimeout(setupHermesFallbackStream, 2000);
        }
      };
    };

    const setupMagicBlockStream = async () => {
      try {
        connection = new Connection(MAGICBLOCK_ER_RPC_URL, {
          wsEndpoint: MAGICBLOCK_ER_WS_URL,
        });
        const feedAddress = derivePythLazerFeedAddress(selectedFeed.pythLazerId);

        const handleAccountInfo = (accountInfo: AccountInfo<Buffer> | null) => {
          if (!isStreamActive || signal.aborted) return;

          const price = parsePythLazerPrice(accountInfo, selectedFeed.exponent);
          if (price === null) return;
          pushLivePrice(price, "magicblock");
        };

        accountSubscriptionId = connection.onAccountChange(
          feedAddress,
          (accountInfo) => handleAccountInfo(accountInfo as AccountInfo<Buffer>),
          "confirmed",
        );

        const accountInfo = await connection.getAccountInfo(feedAddress, "confirmed");
        handleAccountInfo(accountInfo as AccountInfo<Buffer> | null);
      } catch (err) {
        console.error("Failed to subscribe to MagicBlock Pyth feed", err);
        if (isStreamActive && !signal.aborted) {
          setupHermesFallbackStream();
        }
      }
    };

    fetchHistory().then(() => {
      if (!signal.aborted) setupMagicBlockStream();
    });

    return () => {
      isStreamActive = false;
      abortController.abort();
      if (eventSource) {
        eventSource.close();
      }
      if (connection && accountSubscriptionId !== null) {
        connection.removeAccountChangeListener(accountSubscriptionId).catch(() => {});
      }
    };
  }, [ready, asset, targetPriceUsd, direction]);

  if (asset === "Unknown") return null;

  return (
    <div className="w-full h-full min-h-0 overflow-hidden relative font-sans flex flex-col">
      <div className="flex shrink-0 justify-between items-start z-10 px-1 mb-6">
        <div className="flex gap-12">
          {/* Price To Beat */}
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-eclipse-text-muted/60 uppercase tracking-wider mb-1">
              {targetPriceUsd ? "Price To Beat" : "Live Pyth Price"}
            </span>
            <span className="text-[22px] font-bold text-eclipse-text-main/80 leading-none">
              {targetPriceUsd
                ? `$${targetPriceUsd.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}`
                : "---"}
            </span>
          </div>

          {/* Current Price */}
          {targetPriceUsd && (
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-eclipse-text-muted/60 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                Current Price
                <span
                  ref={diffPriceRef}
                  className="text-[10px] font-bold font-mono tracking-tighter"
                ></span>
              </span>
              <div className="flex items-end gap-2">
                <span
                  ref={livePriceRef}
                  className="text-[22px] font-bold transition-colors duration-100 leading-none"
                >
                  ---
                </span>
                <span className="mb-0.5 rounded-full border border-eclipse-border bg-eclipse-panel/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-eclipse-text-muted">
                  {streamSource === "magicblock" ? "MagicBlock live" : streamSource === "hermes" ? "Hermes fallback" : "Connecting"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        ref={chartContainerRef}
        className="min-h-0 flex-1 w-full overflow-hidden"
      />
      <div className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-eclipse-border bg-black/40 px-2 py-1 text-[10px] font-medium text-eclipse-text-muted backdrop-blur">
        {updateCount > 0 ? `${updateCount.toLocaleString()} ticks` : "Waiting for ticks"}
      </div>
    </div>
  );
}

function derivePythLazerFeedAddress(feedId: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("price_feed"),
      Buffer.from("pyth-lazer"),
      Buffer.from(String(feedId)),
    ],
    PYTH_LAZER_PROGRAM_ID,
  )[0];
}

function parsePythLazerPrice(
  accountInfo: AccountInfo<Buffer> | null,
  exponent: number,
): number | null {
  if (!accountInfo?.data || accountInfo.data.length < PYTH_LAZER_PRICE_OFFSET + 8) {
    return null;
  }

  const rawPrice = accountInfo.data.readBigInt64LE(PYTH_LAZER_PRICE_OFFSET);
  return Number(rawPrice) * Math.pow(10, exponent);
}

const PriceChart = dynamic(() => Promise.resolve(PriceChartInner), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center min-h-[250px]">
      <div className="animate-pulse flex flex-col items-center">
        <div className="h-0.5 w-32 bg-eclipse-border rounded mb-4" />
        <div className="h-0.5 w-48 bg-eclipse-border rounded mb-4 opacity-50" />
      </div>
    </div>
  ),
});

export default PriceChart;
