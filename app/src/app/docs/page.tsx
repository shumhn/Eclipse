'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, ExternalLink, FileText, Lock, Shield, Zap } from 'lucide-react';

const statusItems = [
  'Permissionless market creation on Solana devnet',
  'Market and position delegation into MagicBlock PER',
  'Private live trading and hidden positions during the active window',
  'Oracle resolution and settlement inside PER',
];

export default function DocsPage() {
  return (
    <div className="prose prose-slate max-w-none">
      <h1 className="mb-4 text-4xl font-black">Prediction Market Docs</h1>
      <p className="mb-8 text-xl text-dark/70">
        Current product docs for the MagicBlock-powered private prediction market build.
      </p>

      <div className="not-prose mb-10 grid gap-4 md:grid-cols-3">
        <QuickCard
          href="/markets"
          icon={<Zap className="h-6 w-6" />}
          title="Open Markets"
          description="Go straight to the live devnet market flow"
        />
        <QuickCard
          href="/portfolio"
          icon={<BookOpen className="h-6 w-6" />}
          title="Lifecycle Status"
          description="See what parts of the PER lifecycle are live today"
        />
        <QuickCard
          href="/docs/faq"
          icon={<FileText className="h-6 w-6" />}
          title="FAQ"
          description="Read the short product and rollout answers"
        />
      </div>

      <h2 className="mt-8 mb-4 text-2xl font-black">What This Build Is</h2>
      <p>
        This app is a private prediction market on Solana that uses MagicBlock PER for the live market window.
        During active trading, the public shells stay on Solana while the evolving market state and positions run inside the rollup.
      </p>

      <div className="not-prose my-6 rounded-2xl border-2 border-dark bg-slate-50 p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="mb-3 flex items-center gap-2 font-bold text-dark">
          <Lock className="h-5 w-5 text-emerald-600" />
          Working end-to-end today
        </div>
        <div className="space-y-3">
          {statusItems.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-950">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mt-8 mb-4 text-2xl font-black">Current Limitation</h2>
      <p>
        The final undelegation back from the delegation program to the prediction-market program is still being finished.
        That means the last Solana L1 payout claim step should be treated as pending integration, even though trading and settlement already work inside PER.
      </p>

      <h2 className="mt-8 mb-4 text-2xl font-black">Core Flow</h2>
      <ol>
        <li>Create a prediction market on devnet.</li>
        <li>Delegate market and trader position shells into MagicBlock PER.</li>
        <li>Place private YES or NO positions while the market is active.</li>
        <li>Resolve the outcome with the configured oracle.</li>
        <li>Settle the private position inside PER.</li>
        <li>Finish L1 undelegation and payout claim once the final callback path is stable.</li>
      </ol>

      <div className="not-prose mt-10 grid gap-4 md:grid-cols-2">
        <a
          href="https://explorer.solana.com/address/79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t?cluster=devnet"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-slate-100"
        >
          <ExternalLink className="h-5 w-5" />
          <div>
            <div className="font-bold">Program On Explorer</div>
            <div className="text-sm text-slate-600">View the deployed devnet program</div>
          </div>
        </a>
        <Link
          href="/markets"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-slate-100"
        >
          <ArrowRight className="h-5 w-5" />
          <div>
            <div className="font-bold">Launch The Product</div>
            <div className="text-sm text-slate-600">Browse or create a market now</div>
          </div>
        </Link>
      </div>

      <div className="not-prose mt-12 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="font-medium text-amber-800">
          This build runs on Solana devnet and is optimized for product demonstration and lifecycle validation,
          not real-money use.
        </p>
      </div>
    </div>
  );
}

function QuickCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border-2 border-dark bg-slate-50 p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-neon-green/20 hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-dark bg-white p-2">{icon}</div>
        <div className="flex-1">
          <div className="font-bold text-dark">{title}</div>
          <div className="text-sm text-dark/60">{description}</div>
        </div>
        <ArrowRight className="h-5 w-5 text-dark/40 transition-all group-hover:translate-x-1 group-hover:text-dark" />
      </div>
    </Link>
  );
}
