'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TrendingUp, Trophy } from 'lucide-react';

const CATEGORIES = [
  { name: 'Trending', href: '/markets', icon: <TrendingUp className="w-4 h-4 mr-1.5 text-white/70" />, highlight: true },
  { name: 'World Cup', href: '/markets?category=world-cup', icon: <Trophy className="w-4 h-4 mr-1.5 text-yellow-500" />, highlight: true, category: 'world-cup' },
  { name: 'Breaking', href: '/markets', highlight: true },
  { type: 'separator' },
  { name: 'Politics', href: '/markets' },
  { name: 'Sports', href: '/markets?category=world-cup', category: 'world-cup' },
  { name: 'Crypto', href: '/markets?category=crypto', category: 'crypto' },
  { name: 'Esports', href: '/markets' },
  { name: 'Iran', href: '/markets' },
  { name: 'Finance', href: '/markets' },
  { name: 'Geopolitics', href: '/markets' },
  { name: 'Tech', href: '/markets' },
  { name: 'Culture', href: '/markets' },
  { name: 'Economy', href: '/markets' },
  { name: 'Weather', href: '/markets' },
  { name: 'Mentions', href: '/markets' },
  { name: 'Elections', href: '/markets' },
  { name: 'More', href: '/markets' },
];

export default function CategoryNav() {
  const searchParams = useSearchParams();
  const activeCategory = searchParams?.get('category') || 'crypto';

  return (
    <div className="w-full bg-[#030608] border-b border-white/5 overflow-x-auto scrollbar-hide py-3">
      <div className="max-w-[1440px] mx-auto px-6 md:px-12 flex items-center gap-6 text-sm font-medium whitespace-nowrap">
        {CATEGORIES.map((cat, idx) => {
          if (cat.type === 'separator') {
            return <div key={idx} className="w-px h-4 bg-white/10" />;
          }
          const active = cat.category ? cat.category === activeCategory : false;
          return (
            <Link
              key={cat.name}
              href={cat.href || '/markets'}
              className={`flex items-center transition-colors cursor-pointer ${
                active
                  ? 'text-white'
                  : cat.highlight
                  ? 'text-gray-300 hover:text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {cat.icon}
              {cat.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
