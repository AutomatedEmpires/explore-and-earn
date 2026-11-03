import { and, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { auditEvents } from './schema';

export type AuditEvent = typeof auditEvents.$inferSelect;

export type AuditSearch = {
  action?: string;
  actorId?: string;
  subjectType?: string;
  subjectId?: string;
  /** Inclusive. */
  from?: Date;
  /** Exclusive. */
  to?: Date;
  /** Page size, 1 to 200. Default 50. */
  limit?: number;
  /** The previous page's `nextBefore`. */
  before?: string;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Audit events matching every given filter, newest first. When more remain, `nextBefore` is the
 * cursor for the next page (pass it as `before`); otherwise it is null.
 */
export async function searchAudit(
  db: DbOrTx,
  f: AuditSearch,
): Promise<{ items: AuditEvent[]; nextBefore: string | null }> {
  const limit = Math.min(Math.max(Math.floor(f.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);

  for (const [name, value] of [
    ['before', f.before],
    ['actorId', f.actorId],
  ] as const) {
    if (value !== undefined && !UUID.test(value)) throw badRequest(`Invalid ${name}`);
  }

  const where: SQL[] = [];
  if (f.action !== undefined) where.push(eq(auditEvents.action, f.action));
  if (f.actorId !== undefined) where.push(eq(auditEvents.actorId, f.actorId));
  if (f.subjectType !== undefined) where.push(eq(auditEvents.subjectType, f.subjectType));
  if (f.subjectId !== undefined) where.push(eq(auditEvents.subjectId, f.subjectId));
  if (f.from !== undefined) where.push(gte(auditEvents.createdAt, f.from));
  if (f.to !== undefined) where.push(lt(auditEvents.createdAt, f.to));
  if (f.before !== undefined) where.push(lt(auditEvents.id, f.before));

  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(...where))
    .orderBy(desc(auditEvents.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextBefore: rows.length > limit && last ? last.id : null };
}
