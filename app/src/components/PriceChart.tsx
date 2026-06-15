"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

interface PriceChartProps {
  asset: "SOL/USD" | "BTC/USD" | "Unknown";
  targetPriceUsd: number | null;
  direction?: "above" | "below";
  resolutionTimestamp?: number;
}

const FEED_IDS: Record<string, string> = {
  "SOL/USD": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "BTC/USD": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
};

const SYMBOLS: Record<string, string> = {
  "SOL/USD": "Crypto.SOL/USD",
  "BTC/USD": "Crypto.BTC/USD",
};

function getDynamicColor(
  price: number,
  targetPriceUsd: number | null,
  direction: string,
): { line: string; top: string; bottom: string } {
  const baseColor = "#FF8C00";
  const baseTop = "rgba(255, 140, 0, 0.4)";
  const baseBottom = "rgba(255, 140, 0, 0.0)";

  if (!targetPriceUsd)
    return { line: baseColor, top: baseTop, bottom: baseBottom };

  const winning =
    (direction === "above" && price > targetPriceUsd) ||
    (direction === "below" && price < targetPriceUsd);

  if (winning) {
    return {
      line: "#2BA859",
      top: "rgba(43, 168, 89, 0.4)",
      bottom: "rgba(43, 168, 89, 0.0)",
    };
  } else {
    return {
      line: "#E43E4B",
      top: "rgba(228, 62, 75, 0.4)",
      bottom: "rgba(228, 62, 75, 0.0)",
    };
  }
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
  const lastTimeRef = useRef(0);

  // One-time chart creation
  useEffect(() => {
    if (asset === "Unknown" || !chartContainerRef.current) return;

    let destroyed = false;

    import("lightweight-charts").then((lc) => {
      if (destroyed || !chartContainerRef.current) return;

      const chart = lc.createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
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
      const areaSeries = chart.addSeries(lc.AreaSeries, {
        lineColor: "#FF8C00",
        topColor: "rgba(255, 140, 0, 0.4)",
        bottomColor: "rgba(255, 140, 0, 0.0)",
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: false,
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

      const ro = new ResizeObserver(() => {
        if (chartContainerRef.current && !destroyed) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        }
      });
      ro.observe(chartContainerRef.current);

      setReady(true);

      return () => ro.disconnect();
    });

    return () => {
      destroyed = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        areaSeriesRef.current = null;
      }
      setReady(false);
    };
  }, [asset, targetPriceUsd, direction]);

  // Data fetching and SSE stream
  useEffect(() => {
    if (!ready || !areaSeriesRef.current || asset === "Unknown") return;

    const abortController = new AbortController();
    const signal = abortController.signal;
    const symbol = SYMBOLS[asset];
    const feedId = FEED_IDS[asset];
    const areaSeries = areaSeriesRef.current;
    let eventSource: EventSource | null = null;
    let isStreamActive = true;

    const updateLivePriceText = (price: number) => {
      if (livePriceRef.current) {
        livePriceRef.current.innerText = `$${price.toLocaleString(undefined, {
          minimumFractionDigits: 2,
        })}`;
        const colors = getDynamicColor(price, targetPriceUsd, direction);
        livePriceRef.current.style.color = colors.line;

        if (targetPriceUsd && diffPriceRef.current) {
          const diff = Math.abs(price - targetPriceUsd);
          const arrow = price >= targetPriceUsd ? "▴" : "▾";
          diffPriceRef.current.innerText = `${arrow} $${diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          diffPriceRef.current.style.color = colors.line;
        }
      }
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
            updateLivePriceText(chartData[chartData.length - 1].value);
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch pyth history", err);
        }
      }
    };

    const setupLiveStream = () => {
      if (!isStreamActive) return;
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

            updateLivePriceText(actualPrice);

            const now = Math.floor(Date.now() / 1000);
            if (now >= lastTimeRef.current) {
              areaSeries.update({ time: now as any, value: actualPrice });
              lastTimeRef.current = now;
            }

            const colors = getDynamicColor(
              actualPrice,
              targetPriceUsd,
              direction,
            );
            areaSeries.applyOptions({
              lineColor: colors.line,
              topColor: colors.top,
              bottomColor: colors.bottom,
            });
          }
        } catch (err) {
          // ignore stream parse errors
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        if (isStreamActive && !signal.aborted) {
          setTimeout(setupLiveStream, 2000);
        }
      };
    };

    fetchHistory().then(() => {
      if (!signal.aborted) setupLiveStream();
    });

    return () => {
      isStreamActive = false;
      abortController.abort();
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [ready, asset, targetPriceUsd, direction]);

  if (asset === "Unknown") return null;

  return (
    <div className="w-full h-full relative font-sans flex flex-col">
      <div className="flex justify-between items-start z-10 px-1 mb-6">
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
              <span
                ref={livePriceRef}
                className="text-[22px] font-bold transition-colors duration-200 leading-none"
              >
                ---
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        ref={chartContainerRef}
        className="flex-1 w-full"
        style={{ minHeight: 250 }}
      />
    </div>
  );
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
