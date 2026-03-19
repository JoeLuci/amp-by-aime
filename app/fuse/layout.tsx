import { Inter, Playfair_Display } from 'next/font/google'
import type { Metadata } from 'next'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  weight: ['700', '900'],
})

export const metadata: Metadata = {
  title: 'Fuse 2026 Registration | AIME',
  description: 'Register for Fuse 2026 in Austin, Texas — powered by AIME',
}

export default function FuseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${inter.variable} ${playfair.variable}`}>
      {children}
    </div>
  )
}
