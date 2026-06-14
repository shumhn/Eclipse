'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Search } from 'lucide-react';

const PhantomWalletButton = dynamic(
  () => import('./PhantomWalletButton').then((mod) => mod.PhantomWalletButton),
  { ssr: false }
);

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#030608]/80 backdrop-blur-xl border-b border-white/10 transition-all duration-300">
      <div className="max-w-[1440px] mx-auto px-6 md:px-12">
        <div className="flex items-center justify-between h-20">
          {/* Logo & Search */}
          <div className="flex items-center gap-8 lg:gap-16">
            <Link href="/" className="flex items-center gap-3 group shrink-0">
              <div className="w-8 h-8 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" className="w-full h-full transform group-hover:scale-110 transition-transform duration-300">
                  <path d="M12 2.5L21.5 12L12 21.5L2.5 12Z" stroke="white" strokeWidth="3.5" strokeLinejoin="miter"/>
                </svg>
              </div>
              <span className="font-light text-xl hidden sm:block tracking-wide text-white group-hover:text-gray-200 transition-colors">
                MagicBlock <span className="font-medium">Markets</span>
              </span>
            </Link>

            <div className="hidden lg:flex items-center w-full max-w-md relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-500 group-focus-within:text-poly-green transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search private markets..."
                className="block w-full pl-12 pr-4 py-2.5 border border-white/10 rounded-full leading-5 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-poly-green focus:border-poly-green sm:text-sm transition-all duration-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]"
              />
            </div>
          </div>

          {/* Right Links & Wallet */}
          <div className="flex items-center gap-8">
            <div className="hidden lg:flex items-center gap-8 mr-4">
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/markets">Explore</NavLink>
              <NavLink href="/portfolio">Portfolio</NavLink>
            </div>

            <PhantomWalletButton />
          </div>
        </div>
      </div>
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

export default Navbar;
