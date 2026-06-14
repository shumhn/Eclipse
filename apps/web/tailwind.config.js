/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'poly-bg': '#141618',
        'poly-panel': '#1B1E22',
        'poly-green': '#2BA859',
        'poly-green-light': '#3dd176',
        'poly-red': '#E43E4B',
        'poly-red-light': '#f46c5e',
        'poly-blue': '#0082FF',
        'poly-text-main': '#FFFFFF',
        'poly-text-muted': '#A1A1AA',
        'poly-border': '#292C32',
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
}