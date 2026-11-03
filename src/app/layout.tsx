import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Exposed as --font-sans, which the Tailwind theme in src/ui/tokens.css uses for font-sans.
const figtree = Figtree({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Explore&Earn',
  description: 'Work worth going somewhere for.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
