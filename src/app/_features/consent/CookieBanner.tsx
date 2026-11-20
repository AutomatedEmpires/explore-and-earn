'use client';

// The EU cookie banner (SP8 spec 8.4 and section 7). Built here, mounted by SP8 W9 in the root
// layout after the founder approves its design. It shows only to an EU visitor who hasn't chosen,
// as a fixed region that never traps focus. Accept and Reject are the same variant and size, so
// neither is pushed. A choice is recorded by POST /api/v1/consent, which sets the ee_consent
// cookie; the banner hides once it is saved. Accept also loads analytics on this page.
import Link from 'next/link';
import { useState } from 'react';
import { grantAnalyticsConsent, revokeAnalyticsConsent } from '@/lib/analytics-client';
import { Button } from '@/ui/components';

/** Spec 8.4, verbatim. */
export const COOKIE_BANNER_TEXT =
  'We use cookies to keep you signed in. With your OK, we also use analytics cookies to see how Explore&Earn is used so we can improve it. We never sell your data.';

export type CookieBannerProps = {
  region: 'eu' | 'other';
  state: 'granted' | 'denied' | 'unset';
};

/** Posts a choice. True when it was saved. */
export async function saveConsentChoice(analytics: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ analytics }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function CookieBanner({ region, state }: CookieBannerProps) {
  const [hidden, setHidden] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  if (region !== 'eu' || state !== 'unset' || hidden) return null;

  async function choose(analytics: boolean): Promise<void> {
    setPending(analytics);
    setFailed(false);
    const saved = await saveConsentChoice(analytics);
    setPending(null);
    if (!saved) {
      setFailed(true);
      return;
    }
    if (analytics) grantAnalyticsConsent();
    else revokeAnalyticsConsent();
    setHidden(true);
  }

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-4 py-4 shadow-raised sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <p className="flex-1 text-15 text-ink">{COOKIE_BANNER_TEXT}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            loading={pending === true}
            disabled={pending !== null}
            onClick={() => void choose(true)}
          >
            Accept analytics
          </Button>
          <Button
            variant="secondary"
            size="md"
            loading={pending === false}
            disabled={pending !== null}
            onClick={() => void choose(false)}
          >
            Reject
          </Button>
          <Link
            href="/legal/cookies#settings"
            className="inline-flex min-h-11 items-center px-2 text-15 font-semibold text-ink underline underline-offset-4"
          >
            Cookie settings
          </Link>
        </div>
        {failed ? (
          <p role="status" className="text-13 text-muted">
            We couldn&rsquo;t save your choice. Please try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}
