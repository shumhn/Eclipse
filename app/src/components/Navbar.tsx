'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Search } from 'lucide-react';

const PhantomWalletButton = dynamic(
  () => import('./PhantomWalletButton').then((mod) => mod.PhantomWalletButton),
  { ssr: false }
);

import CategoryNav from './CategoryNav';

const Navbar = () => {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      router.push(`/markets?q=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex flex-col transition-all duration-300">
      {/* Main Header */}
      <div className="w-full bg-[#030608]/90 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-[1440px] mx-auto px-6 md:px-12">
          <div className="flex items-center justify-between h-[72px]">
          <div className="flex items-center gap-8 lg:gap-12">
            <Link href="/" className="flex items-center gap-3 group shrink-0">
              <div className="w-8 h-8 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" className="w-full h-full transform group-hover:scale-110 transition-transform duration-300">
                  <path d="M12 2.5L21.5 12L12 21.5L2.5 12Z" stroke="white" strokeWidth="3.5" strokeLinejoin="miter"/>
                </svg>
              </div>
              <span className="font-bold text-xl hidden sm:block tracking-wide text-white group-hover:text-gray-200 transition-colors">
                Eclipse
              </span>
              <div className="hidden sm:flex items-center border-l border-white/20 pl-3 ml-1 h-5">
                <img src="/magicblock-logo.svg" alt="MagicBlock" className="h-[13px] opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="hidden sm:flex items-center px-2 py-0.5 ml-3 rounded bg-blue-500/10 border border-blue-500/20">
                <span className="text-[10px] font-bold text-blue-400 tracking-widest uppercase">Devnet</span>
              </div>
            </Link>

            {/* Navigation Links */}
            <div className="hidden lg:flex items-center gap-8 border-l border-white/10 pl-8">
              <NavLink href="/markets">Markets</NavLink>
              <FutureNavLink>Docs</FutureNavLink>
            </div>
          </div>

          {/* Right Utilities & Wallet */}
          <div className="flex flex-1 items-center justify-end gap-6 ml-8">
            {/* Search */}
            <div className="hidden lg:flex items-center w-full max-w-[320px] relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-500 group-focus-within:text-eclipse-green transition-colors" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearch}
                placeholder="Search private markets..."
                className="block w-full pl-10 pr-4 py-2 border border-white/10 rounded-full leading-5 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-eclipse-green focus:border-eclipse-green sm:text-sm transition-all duration-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]"
              />
            </div>

            {/* Wallet Dropdown */}
            <PhantomWalletButton />
          </div>
        </div>
      </div>
      </div>
      <Suspense fallback={null}>
        <CategoryNav />
      </Suspense>
    </nav>
  );
};

const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link
    href={href}
    className="text-sm font-light text-gray-400 hover:text-white transition-colors tracking-wide"
  >
    {children}
  </Link>
);

const FutureNavLink = ({ children }: { children: React.ReactNode }) => (
  <button
    type="button"
    aria-disabled="true"
    className="text-sm font-light text-gray-400 hover:text-white transition-colors tracking-wide cursor-default"
  >
    {children}
  </button>
);

export default Navbar;
