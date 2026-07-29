import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'YieldNest — Build Retirement Portfolios That Hit Your Targets',
  description:
    'Design a bucket-strategy portfolio with real ETFs and stocks, optimized to hit your exact annual return targets. Track performance, rebalance, and link to your retirement plan.',
  openGraph: {
    title: 'YieldNest',
    description: 'Build retirement portfolios that hit your exact return targets.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-slate-900 flex flex-col">{children}</body>
    </html>
  );
}
