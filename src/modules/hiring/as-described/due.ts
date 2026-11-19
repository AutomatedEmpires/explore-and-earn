// Prompts hires whose As-described check is due. A second run sends nothing.
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getHiringInfoMany } from '@/modules/listings';
import { notify } from '@/modules/notifications';
import { asDescribedResponses, offers, pipelineEntries } from '../schema';
import '../notification-types';
import { sharesHostDomain } from './eligibility';

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_DAYS = 60;
const DUE_AFTER_DAYS = 90;

function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` plus a number of calendar days, in UTC. */
export function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return iso;
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dueDate(
  endDate: string | null | undefined,
  offerStart: string | undefined,
  hiredAt: Date | null,
): string | null {
  if (endDate) return addCalendarDays(endDate, 1);
  if (offerStart) return addCalendarDays(offerStart, DUE_AFTER_DAYS);
  if (hiredAt) return addCalendarDays(utcDay(hiredAt), DUE_AFTER_DAYS);
  return null;
}

export async function asDescribedDue(db: DbOrTx, now: Date): Promise<void> {
  const pending = await db
    .select()
    .from(asDescribedResponses)
    .where(and(isNull(asDescribedResponses.promptedAt), isNotNull(asDescribedResponses.seekerUserId)));
  if (pending.length === 0) return;

  const applicationIds = pending.map((row) => row.applicationId);
  const listingIds = [...new Set(pending.map((row) => row.listingId))];
  const [listings, accepted, hired] = await Promise.all([
    getHiringInfoMany(db, listingIds),
    db
      .select({ applicationId: offers.applicationId, startDate: offers.startDate })
      .from(offers)
      .where(and(eq(offers.status, 'accepted'), inArray(offers.applicationId, applicationIds))),
    db
      .select({ applicationId: pipelineEntries.applicationId, hiredAt: pipelineEntries.hiredAt })
      .from(pipelineEntries)
      .where(inArray(pipelineEntries.applicationId, applicationIds)),
  ]);

  const endByListing = new Map(listings.map((row) => [row.id, row.endDate]));
  const titleByListing = new Map(listings.map((row) => [row.id, row.title]));
  const startByApplication = new Map(accepted.map((row) => [row.applicationId, row.startDate]));
  const hiredByApplication = new Map(hired.map((row) => [row.applicationId, row.hiredAt]));
  const today = utcDay(now);

  for (const row of pending) {
    const seekerUserId = row.seekerUserId;
    if (!seekerUserId) continue;
    const due = dueDate(
      endByListing.get(row.listingId),
      startByApplication.get(row.applicationId),
      hiredByApplication.get(row.applicationId) ?? null,
    );
    if (!due || today < due) continue;
    if (await sharesHostDomain(db, row.orgId, seekerUserId)) continue;

    const expiresAt = new Date(now.getTime() + OPEN_DAYS * DAY_MS);
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(asDescribedResponses)
        .set({ promptedAt: now, expiresAt })
        .where(and(eq(asDescribedResponses.id, row.id), isNull(asDescribedResponses.promptedAt)))
        .returning({ id: asDescribedResponses.id });
      if (updated.length === 0) return;
      await notify(tx, seekerUserId, 'hiring.as_described_prompt', {
        position: titleByListing.get(row.listingId) ?? 'the job',
        asDescribedId: row.id,
      });
    });
  }
}
