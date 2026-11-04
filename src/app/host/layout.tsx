import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getCounts } from '@/server/counts';
import { hostAccess, roleLabel } from '@/server/shell';
import { HostShell } from './_components/HostShell';

async function unreadNotifications(userId: string): Promise<number> {
  try {
    return (await getCounts(getDb(), userId)).notifications;
  } catch (err) {
    // The badge fills in from the live stream; never fail the page over it.
    logger.warn('host shell: counts failed', { userId, err });
    return 0;
  }
}

// Every host page also checks access itself (hostPage), so a guest is sent to sign in with the
// exact page to come back to; here a guest just gets no shell.
export default async function HostLayout({ children }: Readonly<{ children: ReactNode }>) {
  const access = await hostAccess();
  switch (access.kind) {
    case 'redirect':
      return redirect(access.to);
    case 'guest':
      return children;
    case 'locked':
      return <HostShell org={null}>{children}</HostShell>;
    case 'ok':
      return (
        <HostShell
          org={{ clerkOrgId: access.value.clerkOrgId, roleLabel: roleLabel(access.value.role) }}
          initialNotifications={await unreadNotifications(access.value.user.id)}
        >
          {children}
        </HostShell>
      );
  }
}
