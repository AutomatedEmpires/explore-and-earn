import { ClerkProvider } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { consentMeta } from '@/app/_features/consent/consent-meta';
import { getDb } from '@/lib/db';
import { getConsentNotBefore } from '@/modules/content';
import { CONSENT_COOKIE } from '@/modules/privacy';
import { clerkProviderProps } from '@/ui/clerk';
import './globals.css';

// Exposed as --font-sans, which the Tailwind theme in src/ui/tokens.css uses for font-sans.
const figtree = Figtree({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Explore&Earn',
  description: 'Work worth going somewhere for.',
};

/** What a page says when the visitor's consent can't be read: an EU visitor who hasn't chosen. */
const UNREADABLE_CONSENT = 'eu:unset:0';

/**
 * The visitor's consent for `<meta name="ee-consent">` (SP8 Plan decision 19), which
 * initAnalytics reads before it loads PostHog: an EU visitor needs a yes, Global Privacy Control
 * is a no everywhere, and a view-as session never loads it. Anything unreadable loads nothing.
 */
async function readConsentMeta(): Promise<string> {
  try {
    const [requestHeaders, jar] = await Promise.all([headers(), cookies()]);
    let viewAs = false;
    try {
      const claims = (await auth()).sessionClaims as { act?: unknown } | null;
      viewAs = Boolean(claims?.act);
    } catch {
      // No Clerk request scope (the keyless dev proxy): not a view-as session.
    }
    return consentMeta({
      headers: requestHeaders,
      cookieValue: jar.get(CONSENT_COOKIE)?.value ?? null,
      notBefore: await getConsentNotBefore(getDb()),
      viewAs,
    });
  } catch {
    return UNREADABLE_CONSENT;
  }
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Render every page at request time. The proxy's CSP trusts only scripts carrying this
  // request's nonce ('strict-dynamic'), and Next.js adds the nonce only when it renders the page
  // per request; a page prerendered at build time would have every script blocked.
  await connection();
  const consent = await readConsentMeta();
  // One ClerkProvider for the whole app (seeker, host and operator console). `dynamic` renders
  // Clerk's scripts on the server with this request's nonce (x-nonce).
  // The consent tag is in <head> itself, not the Metadata API: generated metadata may stream in
  // after the scripts that read it.
  return (
    <ClerkProvider dynamic {...clerkProviderProps}>
      <html lang="en" className={figtree.variable}>
        <head>
          <meta name="ee-consent" content={consent} />
        </head>
        <body className="font-sans">{children}</body>
      </html>
    </ClerkProvider>
  );
}
