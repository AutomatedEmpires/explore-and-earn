// The Global Privacy Control record (legal review 4.5, P0 item 18). GPC is a rejection
// everywhere. apiRoute stamps a signed-in user the first time one of their requests carries
// Sec-GPC: 1, so work that runs with no request (jobs, SP8 W5's trackForUser, #149) can honor
// the opt-out too. The stamp keeps its first time and is never cleared by a later request.
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { users } from './schema';

/**
 * Stamps `users.analytics_opt_out_at` once. One conditional UPDATE: a no-op (returning false)
 * when the user is already stamped or does not exist.
 */
export async function recordAnalyticsOptOut(db: DbOrTx, userId: string): Promise<boolean> {
  const stamped = await db
    .update(users)
    .set({ analyticsOptOutAt: sql`now()` })
    .where(and(eq(users.id, userId), isNull(users.analyticsOptOutAt)))
    .returning({ id: users.id });
  return stamped.length > 0;
}

/** Whether the user has been recorded as opted out of analytics. */
export async function isAnalyticsOptedOut(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isNotNull(users.analyticsOptOutAt)));
  return row !== undefined;
}
