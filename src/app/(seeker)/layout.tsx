import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getCounts } from '@/server/counts';
import { seekerAccess } from '@/server/shell';
import { SeekerShell } from './_components/SeekerShell';
import type { Counts } from '@/app/_components/useLiveCounts';

const NO_COUNTS: Counts = { inbox: 0, notifications: 0 };

async function countsFor(userId: string): Promise<Counts> {
  try {
    return await getCounts(getDb(), userId);
  } catch (err) {
    // The badges fill in from the live stream; never fail the page over them.
    logger.warn('seeker shell: counts failed', { userId, err });
    return NO_COUNTS;
  }
}

// Guests may browse (each page decides); a user without an account type goes to onboarding,
// and a host or operator goes to their own shell.
export default async function SeekerLayout({ children }: Readonly<{ children: ReactNode }>) {
  const access = await seekerAccess();
  if (access.kind === 'redirect') redirect(access.to);
  const user = access.kind === 'ok' ? access.value : null;

  return (
    <SeekerShell
      signedIn={user !== null}
      initialCounts={user ? await countsFor(user.id) : NO_COUNTS}
    >
      {children}
    </SeekerShell>
  );
}
