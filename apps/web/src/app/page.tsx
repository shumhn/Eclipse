'use client';

import Navbar from '@/components/Navbar';
import HeroSection from '@/components/LandingPage';

export default function Home() {
  return (
    <div className="relative min-h-screen bg-poly-bg text-poly-text-main">
      <Navbar />
      <main>
        <HeroSection />
      </main>
    </div>
  );
}