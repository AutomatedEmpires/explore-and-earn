// Who is looking at the operator console, for its layout and pages. The console lives on the
// admin host (routeForHost rewrites admin.<domain>/x to /admin/x), so its links and redirects use
// host-relative paths: /queues, /passkey.
//
// - Signed out: to /sign-in.
// - An operator without a passkey: to /passkey (the layout still renders, so that page can).
// - Anyone else (a seeker, a host, an account without a type): 404, so the console's pages are
//   not even confirmed to exist.
//
// The layout and the page render at the same time and share this (React cache), so the layout
// runs no queries of its own. Pages also query one at a time rather than with Promise.all: the
// local database (`pnpm db:local`, PGlite behind a socket server) mixes up concurrent queries.
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { listOperators } from '@/modules/operator';
import { requireOperator, type GuardDenial, type OperatorContext } from '@/server/guards';

export type ConsoleViewer =
  | {
      state: 'ok';
      operator: OperatorContext;
      /** For the sidebar. */
      me: { name: string; shiftStatus: 'on_shift' | 'away' };
    }
  | { state: 'needs_passkey' };

function denial(err: unknown): GuardDenial | null {
  if (!isAppError(err) || err.code !== 'forbidden') return null;
  const details = err.details as Partial<GuardDenial> | undefined;
  return details && typeof details.reason === 'string' ? (details as GuardDenial) : null;
}

/** The signed-in operator, once per request. Redirects or 404s everyone else. */
export const consoleViewer = cache(async (): Promise<ConsoleViewer> => {
  let operator: OperatorContext;
  try {
    operator = await requireOperator();
  } catch (err) {
    if (isAppError(err) && err.code === 'unauthorized') redirect('/sign-in');
    if (denial(err)?.reason === 'needs_passkey') return { state: 'needs_passkey' };
    if (isAppError(err)) notFound();
    throw err;
  }
  const me = (await listOperators(getDb())).find((o) => o.userId === operator.user.id);
  return {
    state: 'ok',
    operator,
    me: {
      name: me?.name ?? operator.user.email ?? 'Operator',
      shiftStatus: me?.shiftStatus ?? 'away',
    },
  };
});

/** For a console page: the operator, or a redirect to /passkey (or /sign-in, or a 404). */
export async function requireConsoleOperator(): Promise<OperatorContext> {
  const viewer = await consoleViewer();
  if (viewer.state === 'needs_passkey') redirect('/passkey');
  return viewer.operator;
}
