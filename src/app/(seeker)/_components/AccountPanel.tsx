'use client';

import { SignOutButton, useClerk } from '@clerk/nextjs';
import { Button } from '@/ui/components';
import { Settings } from '@/ui/icons';

/**
 * Account basics that already work: who is signed in, Clerk's account settings and signing out.
 * On phones this is the way to sign out (the avatar menu is in the desktop top bar).
 */
export function AccountPanel({ email }: { email: string | null }) {
  const clerk = useClerk();
  return (
    <section
      aria-labelledby="account-title"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="account-title" className="text-17 font-bold text-ink">
          Account
        </h2>
        {email ? (
          <p className="truncate text-14 text-muted">
            Signed in as <span className="font-semibold text-ink-2">{email}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={Settings} onClick={() => clerk.openUserProfile()}>
          Manage account
        </Button>
        <SignOutButton>
          <Button variant="ghost">Sign out</Button>
        </SignOutButton>
      </div>
    </section>
  );
}
