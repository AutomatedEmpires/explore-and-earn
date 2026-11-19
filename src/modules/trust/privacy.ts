// Trust's privacy handler. Review items about a person or an organization, their checks, notes
// and decisions are safety records: nothing is erased, and they are kept for 12 months after
// the last one is resolved. An export shows the decisions, never the operators' notes.
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { EraseResult, PrivacyHandler, PrivacySubject } from '@/modules/privacy';
import { reviewActions, reviewItems, reviewNotes, trustChecks } from './schema';

const RETAIN_MONTHS = 12;

const subjectTypeOf = (s: PrivacySubject) => (s.kind === 'user' ? 'user' : 'organization');
const subjectIdOf = (s: PrivacySubject) => (s.kind === 'user' ? s.userId : s.orgId);

function untilAfter(resolvedAt: Date): string {
  const until = new Date(resolvedAt.getTime());
  until.setUTCMonth(until.getUTCMonth() + RETAIN_MONTHS);
  return until.toISOString().slice(0, 10);
}

async function retainedFor(
  db: DbOrTx,
  s: PrivacySubject,
  held: boolean,
): Promise<EraseResult['retained']> {
  const type = subjectTypeOf(s);
  const id = subjectIdOf(s);
  const items = await db
    .select({
      id: reviewItems.id,
      checkId: reviewItems.checkId,
      status: reviewItems.status,
      resolvedAt: reviewItems.resolvedAt,
    })
    .from(reviewItems)
    .where(and(eq(reviewItems.subjectType, type), eq(reviewItems.subjectId, id)));
  const itemIds = items.map((item) => item.id);
  const checkIds = items.flatMap((item) => (item.checkId ? [item.checkId] : []));

  const [check] = await db
    .select({ id: trustChecks.id })
    .from(trustChecks)
    .where(
      or(
        and(eq(trustChecks.subjectType, type), eq(trustChecks.subjectId, id)),
        checkIds.length > 0 ? inArray(trustChecks.id, checkIds) : undefined,
      ),
    )
    .limit(1);
  const [note] =
    itemIds.length === 0
      ? []
      : await db
          .select({ id: reviewNotes.id })
          .from(reviewNotes)
          .where(inArray(reviewNotes.itemId, itemIds))
          .limit(1);
  const [action] =
    itemIds.length === 0
      ? []
      : await db
          .select({ id: reviewActions.id })
          .from(reviewActions)
          .where(inArray(reviewActions.itemId, itemIds))
          .limit(1);

  // While an item is open nobody knows when the 12 months start.
  const open = items.some((item) => item.status !== 'resolved' || !item.resolvedAt);
  const latest = items.reduce<Date | null>(
    (max, item) => (item.resolvedAt && (!max || item.resolvedAt > max) ? item.resolvedAt : max),
    null,
  );
  const until = held || open || !latest ? null : untilAfter(latest);
  const reason = held ? ('legal_hold' as const) : ('safety' as const);

  const tables = [
    ...(check ? ['trust_checks'] : []),
    ...(items.length > 0 ? ['review_items'] : []),
    ...(note ? ['review_notes'] : []),
    ...(action ? ['review_actions'] : []),
  ];
  return tables.map((table) => ({ table, reason, until }));
}

export const privacyHandler: PrivacyHandler = {
  module: 'trust',
  tables: ['trust_checks', 'review_items', 'review_notes', 'review_actions'],

  async exportData(db, s) {
    if (s.kind !== 'user') return { records: { decisions: [] }, files: [] };
    const decisions = await db
      .select({
        queue: reviewItems.queue,
        resolution: reviewItems.resolution,
        resolvedAt: reviewItems.resolvedAt,
      })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.subjectType, 'user'),
          eq(reviewItems.subjectId, s.userId),
          eq(reviewItems.status, 'resolved'),
        ),
      )
      .orderBy(asc(reviewItems.resolvedAt), asc(reviewItems.id));
    return { records: { decisions }, files: [] };
  },

  async erase(tx, s, ctx) {
    return { erased: 0, retained: await retainedFor(tx, s, ctx.holds.includes('all')) };
  },
};
