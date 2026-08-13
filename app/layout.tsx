import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import QueryProvider from '@/providers/query-provider';
import { Navbar } from '@/components/layout/Navbar';
import { BottomNav } from '@/components/layout/BottomNav';
import { CinematicFooter } from '@/components/ui/motion-footer';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'RailGaadi — Live Indian Train Tracker',
  description:
    'Experience train tracking redefined. Real-time Indian Railways tracking with interactive vector maps, delay analytics, weather intelligence, and terrain insights.',
  keywords: ['train tracking', 'RailGaadi', 'live train status', 'Indian Railways', 'train map', 'IRCTC train'],
  authors: [{ name: 'RailGaadi' }],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/icons/icon-192.png', sizes: '192x192' },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RailGaadi',
  },
  openGraph: {
    title: 'RailGaadi — Live Indian Train Tracker',
    description: 'Real-time train tracking with interactive maps and delay analytics.',
    type: 'website',
    locale: 'en_IN',
  },
};

export const viewport: Viewport = {
  themeColor: '#0284c7',
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://api.railradar.in" />
        <link rel="preconnect" href="https://api.maptiler.com" />
        <link rel="preconnect" href="https://api.openweathermap.org" />
      </head>
      <body
        className={`${inter.className} min-h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100`}
      >
        <QueryProvider>
          <Navbar />
          <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full pb-24 md:pb-6">
            {children}
          </main>
          <CinematicFooter />
          <Suspense fallback={null}>
            <BottomNav />
          </Suspense>
        </QueryProvider>
      </body>
    </html>
  );
}
