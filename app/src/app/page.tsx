'use client';

import { redirect } from 'next/navigation';

// Landing page commented out — redirect straight to markets
// import Navbar from '@/components/Navbar';
// import HeroSection from '@/components/LandingPage';

export default function Home() {
  redirect('/markets');

  // Original landing page — uncomment to restore:
  // return (
  //   <div className="relative min-h-screen bg-eclipse-bg text-eclipse-text-main">
  //     <Navbar />
  //     <main>
  //       <HeroSection />
  //     </main>
  //   </div>
  // );
}