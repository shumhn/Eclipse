'use client';

import Link from 'next/link';

// Use basic emojis or simple icons as fallback if lucide icons aren't exact matches
// But I'll use simple colored circles or similar if real crypto icons are needed,
// or just standard text to simulate the polymarket UI.
const CATEGORIES = [
  { name: 'Bitcoin', count: 35, icon: '₿', color: '#f7931a' },
  { name: 'Ethereum', count: 18, icon: 'Ξ', color: '#627eea' },
  { name: 'Solana', count: 13, icon: '◎', color: '#14F195' },
  { name: 'XRP', count: 11, icon: '✕', color: '#23292f' },
  { name: 'Dogecoin', count: 6, icon: 'Ð', color: '#c2a633' },
  { name: 'BNB', count: 6, icon: 'B', color: '#f3ba2f' },
  { name: 'Microstrategy', count: 7, icon: 'M', color: '#ff6600' },
];

export default function SidebarNav() {
  return (
    <div className="flex flex-col gap-1 w-full max-w-[240px]">
      {CATEGORIES.map((cat, idx) => (
        <Link
          key={cat.name}
          href={`/markets?category=${cat.name.toLowerCase()}`}
          className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors duration-200 ${
            idx === 0 ? 'bg-[#1e2329] text-white' : 'hover:bg-white/5 text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-inner"
              style={{ backgroundColor: cat.color, color: cat.name === 'Solana' ? '#000' : '#fff' }}
            >
              {cat.icon}
            </div>
            <span className="font-medium text-[15px]">{cat.name}</span>
          </div>
          <span className={`text-sm font-medium ${idx === 0 ? 'text-gray-400' : 'text-gray-500'}`}>
            {cat.count}
          </span>
        </Link>
      ))}
    </div>
  );
}
