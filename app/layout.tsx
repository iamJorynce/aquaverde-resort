import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { getResortSettings } from '@/lib/resort-settings'

const inter = Inter({ subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getResortSettings()
  return {
    title: settings.resort_name,
    description: 'Resort Management System',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}
