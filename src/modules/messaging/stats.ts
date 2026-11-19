// Reply time for the host page, and the daily close stamp (SP5 W4).
import { and, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/lib/db';
import { REPLY_STATS, type ReplyStats } from '@/lib/messaging';
import { getHiringInfoMany } from '@/modules/listings';
import { orgReplyStats, threads } from './schema';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function sameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left === undefined || right === undefined) return null;
  return Math.round((left + right) / 2);
}

function fromRow(row: {
  conversations: number;
  medianFirstReplyMinutes: number | null;
}): ReplyStats {
  return {
    conversations: row.conversations,
    medianFirstReplyMinutes: row.medianFirstReplyMinutes,
    usuallyRepliesWithinDay:
      row.medianFirstReplyMinutes !== null &&
      row.medianFirstReplyMinutes <= REPLY_STATS.withinDayMinutes,
  };
}

async function recompute(db: DbOrTx, orgId: string, now: Date): Promise<ReplyStats> {
  const windowStart = new Date(now.getTime() - REPLY_STATS.windowDays * DAY);
  const rows = await db
    .select()
    .from(threads)
    .where(
      and(
        eq(threads.orgId, orgId),
        isNotNull(threads.applicationId),
        gte(threads.createdAt, windowStart),
      ),
    );
  const samples: number[] = [];
  for (const row of rows) {
    if (row.firstHostReplyAt) {
      samples.push(Math.round((row.firstHostReplyAt.getTime() - row.createdAt.getTime()) / MINUTE));
      continue;
    }
    const age = Math.round((now.getTime() - row.createdAt.getTime()) / MINUTE);
    if (age < REPLY_STATS.minAgeHours * 60) continue;
    samples.push(Math.min(age, REPLY_STATS.capDays * 24 * 60));
  }
  const stats = fromRow({
    conversations: rows.length,
    medianFirstReplyMinutes: median(samples),
  });
  await db
    .insert(orgReplyStats)
    .values({
      orgId,
      conversations: stats.conversations,
      medianFirstReplyMinutes: stats.medianFirstReplyMinutes,
      computedAt: now,
    })
    .onConflictDoUpdate({
      target: orgReplyStats.orgId,
      set: {
        conversations: stats.conversations,
        medianFirstReplyMinutes: stats.medianFirstReplyMinutes,
        computedAt: now,
      },
    });
  return stats;
}

export async function getReplyStats(db: DbOrTx, orgId: string): Promise<ReplyStats> {
  const now = new Date();
  const [cached] = await db.select().from(orgReplyStats).where(eq(orgReplyStats.orgId, orgId));
  if (cached && sameUtcDay(cached.computedAt, now)) return fromRow(cached);
  return recompute(db, orgId, now);
}

export async function runMessagingDaily(db: Db, now: Date): Promise<void> {
  const open = await db
    .select({ id: threads.id, listingId: threads.listingId })
    .from(threads)
    .where(isNull(threads.listingClosedAt));
  const infos = await getHiringInfoMany(db, [...new Set(open.map((row) => row.listingId))]);
  const closedAt = new Map(
    infos.filter((row) => row.closedAt).map((row) => [row.id, row.closedAt as Date]),
  );
  for (const row of open) {
    const at = closedAt.get(row.listingId);
    if (!at) continue;
    await db
      .update(threads)
      .set({ listingClosedAt: at })
      .where(and(eq(threads.id, row.id), isNull(threads.listingClosedAt)));
  }
  const orgs = await db
    .selectDistinct({ orgId: threads.orgId })
    .from(threads);
  for (const org of orgs) await recompute(db, org.orgId, now);
}
