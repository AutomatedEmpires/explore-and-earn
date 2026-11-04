import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

// Exposed as --font-sans, which the Tailwind theme in src/ui/tokens.css uses for font-sans.
const figtree = Figtree({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Explore&Earn',
  description: 'Work worth going somewhere for.',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Render every page at request time. The proxy's CSP trusts only scripts carrying this
  // request's nonce ('strict-dynamic'), and Next.js adds the nonce only when it renders the page
  // per request; a page prerendered at build time would have every script blocked.
  await connection();
  return (
    <html lang="en" className={figtree.variable}>
      <body className="font-sans">
        {/* `dynamic` renders Clerk's scripts per request, with the CSP nonce (x-nonce). */}
        <ClerkProvider dynamic>{children}</ClerkProvider>
      </body>
    </html>
  );
}
