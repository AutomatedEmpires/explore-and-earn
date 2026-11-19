// The hourly watch (SP8 spec 8.1): a request still open after 7 days is flagged `overdue`, a
// support item asks a person to look, and the Owner gets a warning. The legal ceiling is 30
// days, so this leaves three weeks to act.
import { and, asc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { raiseAlert } from '@/modules/trust';
import { OPEN_STATUSES, openExceptionItem } from './requests';
import { privacyRequests } from './schema';

export const OVERDUE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH = 100;

/** Flags every request that became overdue. Returns how many it flagged. */
export async function watchRequests(db: Db, now: Date): Promise<{ flagged: number }> {
  const due = await db
    .select({ id: privacyRequests.id })
    .from(privacyRequests)
    .where(
      and(
        inArray(privacyRequests.status, OPEN_STATUSES),
        isNull(privacyRequests.blockedReason),
        lt(privacyRequests.createdAt, new Date(now.getTime() - OVERDUE_AFTER_MS)),
      ),
    )
    .orderBy(asc(privacyRequests.createdAt))
    .limit(BATCH);

  let flagged = 0;
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [request] = await tx
        .update(privacyRequests)
        .set({ blockedReason: 'overdue' })
        .where(
          and(
            eq(privacyRequests.id, id),
            inArray(privacyRequests.status, OPEN_STATUSES),
            isNull(privacyRequests.blockedReason),
          ),
        )
        .returning({ id: privacyRequests.id, kind: privacyRequests.kind });
      if (!request) return;
      const itemId = await openExceptionItem(tx, request, 'open for 7 days');
      await raiseAlert(tx, {
        severity: 'warning',
        kind: 'privacy_overdue',
        message: 'A privacy request has been open for 7 days.',
        data: { itemId },
      });
      flagged += 1;
    });
  }
  return { flagged };
}
