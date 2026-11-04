import type { Metadata } from 'next';
import Link from 'next/link';
import { hostSecurityPage } from '@/server/shell';
import { Button } from '@/ui/components';
import { ShieldCheck } from '@/ui/icons';
import { SecuritySettings } from '../_components/SecuritySettings';

export const metadata: Metadata = { title: 'Security · Explore&Earn' };

// Owners and Admins need a passkey or two-step sign-in (foundation spec section 3). Until they
// have one, every workspace page sends them here, and this is the only page the shell shows.
export default async function HostSecurityPage() {
  const { locked } = await hostSecurityPage();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-28 font-extrabold tracking-tight text-ink">
          {locked ? 'Secure your account' : 'Security'}
        </h1>
        <p className="max-w-2xl text-16 text-ink-2">
          {locked
            ? 'Owners and Admins need a passkey or two-step sign-in before the host workspace opens. Add one below, then continue.'
            : 'Your passkeys, two-step sign-in and password.'}
        </p>
      </header>
      {locked ? (
        <section
          aria-label="Next step"
          className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-3 text-15 text-ink">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ink-2" />
            <span>Added a passkey or turned on two-step sign-in? Continue to your workspace.</span>
          </p>
          <Button asChild className="shrink-0">
            <Link href="/host">Continue to Home</Link>
          </Button>
        </section>
      ) : null}
      <SecuritySettings />
    </div>
  );
}
