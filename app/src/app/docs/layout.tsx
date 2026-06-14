'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { Book, HelpCircle, ChevronRight, Home } from 'lucide-react';

const docsNav = [
  { href: '/docs', label: 'Overview', icon: Book },
  { href: '/docs/faq', label: 'FAQ', icon: HelpCircle },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-off-white">
      <Navbar />

      <main className="pt-24 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-dark/60 mb-6">
            <Link href="/" className="hover:text-dark transition-colors flex items-center gap-1">
              <Home className="w-4 h-4" />
              Home
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-dark font-medium">Documentation</span>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar */}
            <aside className="lg:w-64 flex-shrink-0">
              <div className="sticky top-24 bg-white border-2 border-dark rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4">
                <h3 className="font-black text-lg mb-4 px-2">Current Docs</h3>
                <nav className="space-y-1">
                  {docsNav.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                          isActive
                            ? 'bg-neon-green text-dark shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                            : 'text-dark/70 hover:bg-dark/5 hover:text-dark'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </aside>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="bg-white border-2 border-dark rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6 md:p-8">
                {children}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
