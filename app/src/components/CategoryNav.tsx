'use client';

import Link from 'next/link';
import { TrendingUp, Trophy } from 'lucide-react';

const CATEGORIES = [
  { name: 'Trending', icon: <TrendingUp className="w-4 h-4 mr-1.5 text-white/70" />, highlight: true },
  { name: 'World Cup', icon: <Trophy className="w-4 h-4 mr-1.5 text-yellow-500" />, highlight: true },
  { name: 'Breaking', highlight: true },
  { type: 'separator' },
  { name: 'Politics' },
  { name: 'Sports' },
  { name: 'Crypto', active: true },
  { name: 'Esports' },
  { name: 'Iran' },
  { name: 'Finance' },
  { name: 'Geopolitics' },
  { name: 'Tech' },
  { name: 'Culture' },
  { name: 'Economy' },
  { name: 'Weather' },
  { name: 'Mentions' },
  { name: 'Elections' },
  { name: 'More' },
];

export default function CategoryNav() {
  return (
    <div className="w-full bg-[#030608] border-b border-white/5 overflow-x-auto scrollbar-hide py-3">
      <div className="max-w-[1440px] mx-auto px-6 md:px-12 flex items-center gap-6 text-sm font-medium whitespace-nowrap">
        {CATEGORIES.map((cat, idx) => {
          if (cat.type === 'separator') {
            return <div key={idx} className="w-px h-4 bg-white/10" />;
          }
          return (
            <button
              key={cat.name}
              className={`flex items-center transition-colors cursor-pointer ${
                cat.active
                  ? 'text-white'
                  : cat.highlight
                  ? 'text-gray-300 hover:text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {cat.icon}
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
