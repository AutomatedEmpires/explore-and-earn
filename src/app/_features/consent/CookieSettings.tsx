'use client';

// Cookie settings (SP8 spec 8.4): the analytics switch at /legal/cookies#settings, for every
// region. Built here, mounted by SP8 W9 after the founder approves its design. Saving records
// the choice like the banner does, then loads or stops analytics on this page.
import { useState } from 'react';
import { grantAnalyticsConsent, revokeAnalyticsConsent } from '@/lib/analytics-client';
import { Button, Switch } from '@/ui/components';
import { saveConsentChoice } from './CookieBanner';

export type CookieSettingsProps = {
  /** The visitor's current choice, or null when they haven't chosen. */
  analytics: boolean | null;
};

export function CookieSettings({ analytics }: CookieSettingsProps) {
  const [on, setOn] = useState(analytics ?? false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null);

  async function save(): Promise<void> {
    setPending(true);
    setStatus(null);
    const choice = on;
    const saved = await saveConsentChoice(choice);
    setPending(false);
    if (!saved) {
      setStatus('failed');
      return;
    }
    if (choice) grantAnalyticsConsent();
    else revokeAnalyticsConsent();
    setStatus('saved');
  }

  return (
    <div className="flex flex-col gap-3">
      <Switch
        label="Analytics cookies"
        description="Help us see how Explore&Earn is used so we can improve it."
        checked={on}
        onCheckedChange={setOn}
        disabled={pending}
      />
      <div className="flex items-center gap-3">
        <Button variant="secondary" loading={pending} onClick={() => void save()}>
          Save
        </Button>
        <p role="status" className="text-13 text-muted">
          {status === 'saved'
            ? 'Your choice is saved.'
            : status === 'failed'
              ? 'We couldn’t save your choice. Please try again.'
              : ''}
        </p>
      </div>
    </div>
  );
}
