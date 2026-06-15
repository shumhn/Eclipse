'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface FAQItem {
  question: string;
  answer: React.ReactNode;
  category: 'general' | 'privacy' | 'trading' | 'technical';
}

const faqs: FAQItem[] = [
  {
    category: 'general',
    question: 'What is this app?',
    answer: (
      <p>
        This is a Solana devnet prediction market that uses MagicBlock PER for the active trading
        window. Market shells live on Solana, while the private live state runs inside the rollup
        until resolution.
      </p>
    ),
  },
  {
    category: 'general',
    question: 'Is this a real prediction market?',
    answer: (
      <p>
        Yes, the market accounts are real devnet accounts and the flow talks to the deployed
        program. This build is for demo and validation on devnet, not for real-money production use.
      </p>
    ),
  },
  {
    category: 'general',
    question: 'Is this live on mainnet?',
    answer: (
      <p>
        No. The current rollout is on Solana devnet. Treat it as a product and protocol demo until
        audits, operations, and the final undelegation path are fully finished.
      </p>
    ),
  },
  {
    category: 'privacy',
    question: 'What exactly is hidden vs. public?',
    answer: (
      <>
        <p><strong>Hidden during the PER trading window:</strong></p>
        <ul className="list-disc list-inside mt-1 mb-3">
          <li>Live position balances</li>
          <li>Live market reserves and evolving odds</li>
          <li>Other traders&apos; exact active exposure</li>
        </ul>
        <p><strong>Public on Solana:</strong></p>
        <ul className="list-disc list-inside mt-1">
          <li>The market question and odds</li>
          <li>The market shell and trader position shell accounts</li>
          <li>Delegation status and final resolved state once committed back</li>
        </ul>
      </>
    ),
  },
  {
    category: 'privacy',
    question: 'Why use MagicBlock PER?',
    answer: (
      <p>
        The rollup lets the app keep market activity private during the live window while still
        preserving a Solana settlement anchor. That reduces copy-trading and front-running during
        the period where information asymmetry matters most.
      </p>
    ),
  },
  {
    category: 'privacy',
    question: 'Are positions completely secret forever?',
    answer: (
      <p>
        No. The goal is privacy during active trading, not permanent invisibility. Once the market
        resolves, the final state is committed back so the market can settle.
      </p>
    ),
  },
  {
    category: 'trading',
    question: 'What is the current working user flow?',
    answer: (
      <>
        <ol className="list-decimal list-inside space-y-1">
          <li>Connect your Phantom wallet (set to Devnet)</li>
          <li>Create a market or open an existing delegated market</li>
          <li>Open and fund your position shell on Solana</li>
          <li>Delegate that position into PER</li>
          <li>Place a YES or NO trade inside the private flow</li>
        </ol>
      </>
    ),
  },
  {
    category: 'trading',
    question: 'What happens when a market resolves?',
    answer: (
      <p>
        The configured oracle resolves the outcome, the PER market state settles, and the final
        state is committed back toward Solana. The last undelegation and L1 claim step is the part
        still being finished in this build.
      </p>
    ),
  },
  {
    category: 'trading',
    question: 'Are there any fees?',
    answer: (
      <p>
        The current devnet demo focuses on behavior rather than fee optimization. Expect standard
        devnet transaction costs and evolving protocol economics while the product is still under construction.
      </p>
    ),
  },
  {
    category: 'trading',
    question: 'How do I get Devnet tokens to test?',
    answer: (
      <>
        <p><strong>Devnet SOL:</strong> Use the{' '}
          <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="text-neon-green hover:underline">
            Solana Faucet
          </a>
          {' '}or run <code className="bg-slate-100 px-1 rounded">solana airdrop 1</code> in the CLI.
        </p>
        <p className="mt-2">
          <strong>Devnet USDC:</strong> You can get test USDC from various Devnet faucets. The
          USDC mint address used by this app is: <code className="bg-slate-100 px-1 rounded text-xs">4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU</code>
        </p>
      </>
    ),
  },
  {
    category: 'technical',
    question: 'What still is not fully done?',
    answer: (
      <p>
        Final undelegation from the delegation program back to the prediction-market program and the
        last user-facing L1 claim step still need to be finalized and re-tested end to end.
      </p>
    ),
  },
  {
    category: 'technical',
    question: 'Who resolves the market right now?',
    answer: (
      <p>
        For the current demo build, the simplest option is an admin or team-controlled oracle.
        That is fast and practical for testing, even though it is not the final permissionless oracle design.
      </p>
    ),
  },
  {
    category: 'technical',
    question: 'Is the code open source?',
    answer: (
      <p>
        Yes. The codebase
        includes the Next.js frontend, Express backend, and Anchor smart contracts.
      </p>
    ),
  },
  {
    category: 'technical',
    question: 'What should I test first locally?',
    answer: (
      <p>
        Start with the core flow only: open `/markets`, inspect a market detail page, create a market,
        and verify trade preparation. Once that path is stable, then test the deeper PER settlement lifecycle.
      </p>
    ),
  },
];

export default function FAQPage() {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set([0]));

  const toggleItem = (index: number) => {
    const newSet = new Set(openItems);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setOpenItems(newSet);
  };

  const categories = [
    { key: 'general', label: 'General' },
    { key: 'privacy', label: 'Privacy' },
    { key: 'trading', label: 'Trading' },
    { key: 'technical', label: 'Technical' },
  ];

  return (
    <div className="prose prose-slate max-w-none">
      <h1 className="font-black text-4xl mb-4">Frequently Asked Questions</h1>
      <p className="text-xl text-dark/70 mb-8">
        Common questions about Eclipse, privacy, and how it all works.
      </p>

      {categories.map(({ key, label }) => {
        const categoryFaqs = faqs.filter((f) => f.category === key);
        if (categoryFaqs.length === 0) return null;

        return (
          <div key={key} className="mb-8">
            <h2 className="font-black text-xl mb-4 not-prose">{label}</h2>
            <div className="space-y-3 not-prose">
              {categoryFaqs.map((faq) => {
                const globalIndex = faqs.indexOf(faq);
                const isOpen = openItems.has(globalIndex);

                return (
                  <div
                    key={globalIndex}
                    className="border-2 border-dark rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggleItem(globalIndex)}
                      className="w-full flex items-center justify-between p-4 text-left font-bold hover:bg-slate-50 transition-colors"
                    >
                      <span>{faq.question}</span>
                      {isOpen ? (
                        <ChevronUp className="w-5 h-5 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 flex-shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 text-dark/70 text-sm border-t border-slate-200 pt-3">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="mt-10 p-4 bg-slate-50 border border-slate-200 rounded-lg not-prose">
        <h3 className="font-bold mb-2">Still have questions?</h3>
        <p className="text-sm text-dark/70">
          Check out the{' '}
          <Link href="/docs/architecture" className="text-neon-green hover:underline">
            Architecture
          </Link>
          {' '}and{' '}
          <Link href="/docs/contracts" className="text-neon-green hover:underline">
            Smart Contracts
          </Link>
          {' '}documentation for more technical details, or reach out on GitHub.
        </p>
      </div>

      <div className="mt-10 not-prose">
        <Link
          href="/docs/contracts"
          className="inline-flex items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 border-2 border-dark rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <div>
            <div className="text-sm text-dark/60">Previous</div>
            <div className="font-bold">Smart Contracts</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
