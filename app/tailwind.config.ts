import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'dark': '#0a0a0a',
        'neon-purple': '#8B5CF6',
        'eclipse-bg': '#000000',
        'eclipse-panel': '#0d0e10',
        'eclipse-green': '#2BA859',
        'eclipse-green-light': '#3dd176',
        'eclipse-red': '#E43E4B',
        'eclipse-red-light': '#f46c5e',
        'eclipse-blue': '#0082FF',
        'eclipse-text-main': '#FFFFFF',
        'eclipse-text-muted': '#A1A1AA',
        'eclipse-border': '#1e2025',
      },
      fontFamily: {
        mono: ['var(--font-mono)'],
        sans: ['var(--font-sans)', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        flow: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.8s ease-out forwards',
        'flow': 'flow 15s linear infinite',
      }
    },
  },
  plugins: [],
};

export default config;
