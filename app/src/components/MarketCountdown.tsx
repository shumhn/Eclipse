"use client";

import { useEffect, useState } from "react";

interface MarketCountdownProps {
  resolutionTimestamp: number;
}

export default function MarketCountdown({
  resolutionTimestamp,
}: MarketCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: string;
    hours: string;
    min: string;
    sec: string;
    expired: boolean;
  } | null>(null);

  useEffect(() => {
    if (!resolutionTimestamp) return;

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = resolutionTimestamp - now;
      if (diff <= 0) {
        setTimeLeft({
          days: "00",
          hours: "00",
          min: "00",
          sec: "00",
          expired: true,
        });
        return;
      }
      const days = Math.floor(diff / (3600 * 24))
        .toString()
        .padStart(2, "0");
      const hours = Math.floor((diff % (3600 * 24)) / 3600)
        .toString()
        .padStart(2, "0");
      const min = Math.floor((diff % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const sec = (diff % 60).toString().padStart(2, "0");
      setTimeLeft({ days, hours, min, sec, expired: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [resolutionTimestamp]);

  if (!timeLeft || timeLeft.expired) return null;

  return (
    <div className="flex gap-4">
      {parseInt(timeLeft.days) > 0 && (
        <div className="flex flex-col items-center">
          <span className="text-3xl font-bold leading-none text-[#F05252]">
            {timeLeft.days}
          </span>
          <span className="text-[11px] font-semibold tracking-widest mt-1 text-eclipse-text-muted/60 uppercase">
            DAYS
          </span>
        </div>
      )}
      <div className="flex flex-col items-center">
        <span className="text-3xl font-bold leading-none text-[#F05252]">
          {timeLeft.hours}
        </span>
        <span className="text-[11px] font-semibold tracking-widest mt-1 text-eclipse-text-muted/60 uppercase">
          HRS
        </span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-3xl font-bold leading-none text-[#F05252]">
          {timeLeft.min}
        </span>
        <span className="text-[11px] font-semibold tracking-widest mt-1 text-eclipse-text-muted/60 uppercase">
          MINS
        </span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-3xl font-bold leading-none text-[#F05252]">
          {timeLeft.sec}
        </span>
        <span className="text-[11px] font-semibold tracking-widest mt-1 text-eclipse-text-muted/60 uppercase">
          SECS
        </span>
      </div>
    </div>
  );
}
