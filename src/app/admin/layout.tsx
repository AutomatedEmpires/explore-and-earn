// The operator console's shell (spec section 11): a sidebar with Home, Review queues, Users &
// orgs (a placeholder), Audit log, Operators and Settings. Served on the admin host only: the
// proxy rewrites admin.<domain>/x to /admin/x and answers 404 for /admin anywhere else.
//
// Only operators see it. Everyone else is sent to sign in or gets a 404 (see consoleViewer);
// an operator without a passkey gets a bare frame, for the passkey page. Each page checks the
// operator again itself, since a layout is not re-run on every navigation.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getEnv } from '@/lib/env';
import { Badge, Wordmark } from '@/ui/components';
import { ConsoleNav } from './_components/ConsoleNav';
import { consoleViewer } from './_lib/session';

export const metadata: Metadata = {
  title: { default: 'Operator console', template: '%s · Explore&Earn console' },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const viewer = await consoleViewer();

  if (viewer.state === 'needs_passkey') {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-line px-4">
          <Wordmark />
          <Badge size="sm" tone="inverse">
            Operator
          </Badge>
        </header>
        <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
          {children}
        </main>
      </div>
    );
  }

  const { operator, me } = viewer;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <ConsoleNav
        operator={{
          userId: operator.user.id,
          name: me.name,
          role: operator.role,
          shiftStatus: me.shiftStatus,
        }}
        showPlaceholders={getEnv().APP_ENV !== 'prod'}
      />
      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}
