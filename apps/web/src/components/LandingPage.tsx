'use client';

import Link from 'next/link';
import { ArrowRight, Shield, Zap, EyeOff, Lock, Activity, Database } from 'lucide-react';
import React from 'react';

const HorizontalWaves = () => (
  <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#030608]">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#183a24] via-[#030608] to-[#030608] opacity-80" />
    
    <svg className="absolute w-[200%] h-full object-cover opacity-60 animate-flow" viewBox="0 0 2880 800" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="meshGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2BA859" stopOpacity="0" />
          <stop offset="10%" stopColor="#2BA859" stopOpacity="0.4" />
          <stop offset="25%" stopColor="#3dd176" stopOpacity="0.8" />
          <stop offset="40%" stopColor="#2BA859" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#2BA859" stopOpacity="0" />
          
          {/* Second half for seamless tile */}
          <stop offset="60%" stopColor="#2BA859" stopOpacity="0.4" />
          <stop offset="75%" stopColor="#3dd176" stopOpacity="0.8" />
          <stop offset="90%" stopColor="#2BA859" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#2BA859" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {Array.from({ length: 30 }).map((_, i) => {
        const yOffset = i * 12;
        const phase = i * 25;
        const startY = 250 + yOffset;
        const c1Y = 100 + yOffset;
        const c2Y = 600 + yOffset;
        return (
          <path
            key={i}
            d={`M0,${startY} C${350 + phase},${c1Y} ${700 - phase},${c2Y} 1440,${startY} C${1440 + 350 + phase},${c1Y} ${1440 + 700 - phase},${c2Y} 2880,${startY}`}
            stroke="url(#meshGradient)"
            strokeWidth={1}
            fill="none"
            opacity={0.2 + (i % 4) * 0.15}
          />
        );
      })}
      {Array.from({ length: 30 }).map((_, i) => {
        const yOffset = i * 12;
        const phase = i * 30;
        const startY = 550 - yOffset;
        const c1Y = 700 - yOffset;
        const c2Y = 200 - yOffset;
        return (
          <path
            key={`rev-${i}`}
            d={`M0,${startY} C${450 - phase},${c1Y} ${850 + phase},${c2Y} 1440,${startY} C${1440 + 450 - phase},${c1Y} ${1440 + 850 + phase},${c2Y} 2880,${startY}`}
            stroke="url(#meshGradient)"
            strokeWidth={0.5}
            fill="none"
            opacity={0.1 + (i % 3) * 0.15}
          />
        );
      })}
    </svg>
  </div>
);

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-32 pb-16 font-sans overflow-hidden">
      <HorizontalWaves />

      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 md:px-12 flex flex-col items-center justify-center text-center pt-24 md:pt-32">
        <h1 className="font-light text-4xl md:text-6xl lg:text-7xl xl:text-[80px] tracking-tight mb-16 text-white animate-fade-in leading-[1.1] whitespace-nowrap" style={{ animationDelay: '0.1s' }}>
          A Private Prediction Market
        </h1>

        <div className="w-full flex justify-center mt-16 max-w-5xl mx-auto">
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 text-lg md:text-xl font-light text-[#E0E0E0] text-left">
            {[
              { text: "State runs inside an Ephemeral Rollup", Icon: Zap },
              { text: "Positions hidden until resolution window closes", Icon: EyeOff },
              { text: "Outcomes committed onchain at close", Icon: Database },
              { text: "No floor manipulation, no insider positioning", Icon: Shield }
            ].map(({ text, Icon }, i) => (
              <li 
                key={i} 
                className="flex items-center gap-5 p-5 md:p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 animate-fade-in opacity-0 group"
                style={{ animationDelay: `${0.3 + (i * 0.15)}s`, animationFillMode: 'forwards' }}
              >
                <div className="w-12 h-12 rounded-full bg-poly-green/10 flex items-center justify-center shrink-0 group-hover:bg-poly-green/20 group-hover:scale-110 transition-all duration-300">
                  <Icon className="w-5 h-5 text-poly-green" />
                </div>
                <span className="leading-snug tracking-wide text-white/90 group-hover:text-white transition-colors">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-20 animate-fade-in opacity-0" style={{ animationDelay: '1.0s', animationFillMode: 'forwards' }}>
          <Link href="/markets">
            <button className="group relative px-12 py-5 bg-white/5 text-white font-light text-xl rounded-full border border-white/20 hover:border-white/60 transition-all duration-300 flex items-center justify-center gap-4 overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:bg-white/10">
              <span className="relative z-10 tracking-wider">Enter App</span>
              <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
            </button>
          </Link>
        </div>

        <div className="mt-20 flex items-center justify-center gap-4 animate-fade-in opacity-0" style={{ animationDelay: '1.2s', animationFillMode: 'forwards' }}>
          <div className="w-8 h-8 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
              <path d="M12 2.5L21.5 12L12 21.5L2.5 12Z" stroke="white" strokeWidth="3.5" strokeLinejoin="miter"/>
            </svg>
          </div>
          <span className="text-2xl font-medium tracking-widest text-white/90">MagicBlock</span>
        </div>
      </div>
    </section>
  );
};

const Features = () => (
  <section className="py-32 px-6 md:px-12 bg-[#030608] text-white relative overflow-hidden">
    <div className="max-w-6xl mx-auto relative z-10">
      <div className="text-center mb-24">
        <h2 className="text-4xl md:text-5xl font-light tracking-wide mb-6">Why Private Markets?</h2>
        <p className="text-xl text-[#A1A1AA] font-light max-w-2xl mx-auto leading-relaxed">
          Built on Solana and Ephemeral Rollups to provide a completely new trading experience without MEV or front-running.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
        {[
          {
            icon: EyeOff,
            title: "Zero-Knowledge State",
            desc: "Order books and individual positions are completely hidden inside the TEE until the market resolves."
          },
          {
            icon: Zap,
            title: "Sub-Second Latency",
            desc: "Trades execute instantly inside the Ephemeral Rollup with zero gas fees during the active market window."
          },
          {
            icon: Shield,
            title: "MEV Protection",
            desc: "Since the state is private and processed off-chain in the TEE, miners and bots cannot front-run your trades."
          }
        ].map((feat, i) => (
          <div key={i} className="p-10 rounded-[2rem] bg-gradient-to-b from-white/[0.04] to-transparent border border-white/5 hover:border-poly-green/30 transition-all duration-500 group">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
              <feat.icon className="w-8 h-8 text-poly-green" />
            </div>
            <h3 className="text-2xl font-light mb-4">{feat.title}</h3>
            <p className="text-[#A1A1AA] leading-relaxed font-light text-lg">{feat.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const HowItWorks = () => (
  <section className="py-32 px-6 md:px-12 bg-[#020406] text-white relative overflow-hidden">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-poly-green/5 rounded-full blur-[120px] pointer-events-none" />

    <div className="max-w-5xl mx-auto relative z-10">
      <div className="text-center mb-24">
        <h2 className="text-4xl md:text-5xl font-light tracking-wide mb-6">How It Works</h2>
        <p className="text-xl text-[#A1A1AA] font-light">The lifecycle of an Ephemeral Market</p>
      </div>

      <div className="space-y-16 lg:space-y-24">
        {[
          {
            step: "01",
            title: "Deposit & Delegate",
            desc: "Deposit USDC collateral on Solana L1 and delegate your position to the MagicBlock Ephemeral Rollup.",
            icon: Database
          },
          {
            step: "02",
            title: "Trade Privately",
            desc: "Buy and sell YES/NO shares instantly. Your balance updates in the TEE without broadcasting to the public ledger.",
            icon: Lock
          },
          {
            step: "03",
            title: "Settle On-Chain",
            desc: "When the oracle triggers resolution, the final state is committed back to Solana L1 and you can claim your winnings.",
            icon: Activity
          }
        ].map((item, i) => (
          <div key={i} className="flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-16 group">
            <div className="text-7xl lg:text-8xl font-light text-white/5 group-hover:text-poly-green/20 transition-colors duration-500 w-32 shrink-0">
              {item.step}
            </div>
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center shrink-0 group-hover:border-poly-green/50 transition-colors duration-500">
              <item.icon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="text-3xl font-light mb-4">{item.title}</h3>
              <p className="text-[#A1A1AA] text-xl font-light leading-relaxed max-w-2xl">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="py-12 border-t border-white/5 bg-[#020406] text-[#A1A1AA] text-center font-light">
    <div className="flex items-center justify-center gap-3 mb-6 opacity-50">
      <div className="w-5 h-5 flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
          <path d="M12 2L22 12L12 22L2 12L12 2Z" fill="currentColor"/>
          <path d="M12 6L18 12L12 18L6 12L12 6Z" fill="#020406"/>
        </svg>
      </div>
      <span className="text-lg tracking-widest uppercase">MagicBlock</span>
    </div>
    <p>© 2026 Prediction Markets. All rights reserved.</p>
  </footer>
);

export default function LandingPage() {
  return (
    <div className="bg-[#030608] min-h-screen">
      <Hero />
      <Features />
      <HowItWorks />
      <Footer />
    </div>
  );
}
