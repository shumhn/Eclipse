import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const font = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata = {
  title: 'Eclipse',
  description: 'Private prediction markets where whales can\'t front-run your trades',
  icons: {
    icon: '/frog-logo.svg',
    shortcut: '/frog-logo.svg',
    apple: '/frog-logo.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={font.variable}>
      <body className={`${font.className} bg-poly-bg text-poly-text-main font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}