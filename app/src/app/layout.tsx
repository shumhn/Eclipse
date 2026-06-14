import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const font = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata = {
  title: 'Eclipse',
  description: 'Private prediction markets on Solana with shielded positions',
  icons: {
    icon: '/eclipse-logo.svg',
    shortcut: '/eclipse-logo.svg',
    apple: '/eclipse-logo.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={font.variable}>
      <body className={`${font.className} bg-eclipse-bg text-eclipse-text-main font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}