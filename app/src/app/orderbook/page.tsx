'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { ArrowRight, EyeOff, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OrderbookPage() {
  return (
    <div className="min-h-screen bg-off-white">
      <Navbar />
      <main className="pt-24 pb-16 px-6">
        <div className="mx-auto max-w-4xl py-20 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <EyeOff className="h-10 w-10 text-emerald-700" />
          </div>
          <h1 className="mb-4 text-4xl font-black">No Public Orderbook In This Build</h1>
          <p className="mx-auto max-w-2xl text-xl text-dark/60">
            Live position state and price movement happen inside MagicBlock PER, so there is no traditional
            public orderbook to inspect during the active market window.
          </p>

          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border-2 border-dark bg-white p-6 text-left shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="mb-3 flex items-center gap-2 font-bold text-emerald-700">
              <Zap className="h-5 w-5" />
              Current product direction
            </div>
            <p className="text-sm text-dark/70">
              The primary demo flow is now: create a market, delegate into PER, place private trades,
              resolve the outcome, and settle the position privately. Public market microstructure views are not part of the MVP.
            </p>
          </div>

          <Link href="/markets" className="mt-8 inline-block">
            <Button variant="hero" size="lg">
              Go To Markets
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
