// The live listing lifecycle (spec section 8.2): closing (by the host, at the end date, on a
// downgrade, lapse or suspension), the "Still hiring?" answer, whether applications are open,
// and the three schedules (reminders, auto-close, repost reminders).
import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record, type AuditEventInput } from '@/modules/audit';
import { emit } from '@/modules/jobs';
import { notify } from '@/modules/notifications';
import { getOrgSummaries } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';
import { findListing, loadListing, userActor, type ListingRecord } from './access';
import { revisionUnderReview, teamFor } from './publish';
import { listingRevisions, listings, type CLOSE_REASONS } from './schema';
import { ownerAdminUserIds } from './team';
import { computeApplicationsCloseAt, nextReminderAt } from './time';

export type CloseReason = (typeof CLOSE_REASONS)[number];
type Actor = Pick<AuditEventInput, 'actorType' | 'actorId'>;

const SYSTEM: Actor = { actorType: 'system', actorId: null };
const BATCH = 500;
const DAY_MS = 86_400_000;
const REPOST_LEAD_DAYS = 56;

const href = (id: string) => `/host/listings/${id}`;

async function liveContent(db: DbOrTx, l: ListingRecord): Promise<unknown> {
  if (!l.publishedRevisionId) return l.draft;
  const [rev] = await db
    .select({ content: listingRevisions.content })
    .from(listingRevisions)
    .where(eq(listingRevisions.id, l.publishedRevisionId));
  return rev?.content ?? l.draft;
}

/**
 * Closes one live listing inside the caller's transaction: `closed` with the reason, any
 * pending edit rejected, `listing.closed` emitted (SP3 removes it from search) and
 * `listings.closed` recorded. The slot is free as soon as it commits.
 */
export async function closeOne(
  tx: DbOrTx,
  l: ListingRecord,
  reason: CloseReason,
  now: Date,
  actor: Actor = SYSTEM,
): Promise<void> {
  const pending = await revisionUnderReview(tx, l);
  if (pending && (pending.status === 'screening' || pending.status === 'in_review')) {
    await tx
      .update(listingRevisions)
      .set({
        status: 'rejected',
        decidedAt: now,
        checks: { ...(pending.checks ?? {}), reasons: ['listing_closed'] },
      })
      .where(eq(listingRevisions.id, pending.id));
  }
  await tx
    .update(listings)
    .set({
      state: 'closed',
      closedAt: now,
      closeReason: reason,
      reviewStage: null,
      pendingRevisionId: null,
    })
    .where(eq(listings.id, l.id));
  await emit(
    tx,
    'listing.closed',
    {
      listingId: l.id,
      orgId: l.orgId,
      ...(l.publishedRevisionId ? { revisionId: l.publishedRevisionId } : {}),
      reason,
    },
    newId(),
  );
  await record(tx, {
    ...actor,
    orgId: l.orgId,
    action: 'listings.closed',
    subjectType: 'listing',
    subjectId: l.id,
    data: { reason, revisionId: l.publishedRevisionId },
  });
}

/** The host closes a live listing (409 unless it is active). */
export async function closeListing(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
  now: Date = new Date(),
): Promise<{ state: 'closed' }> {
  await db.transaction(async (tx) => {
    const l = await loadListing(tx, ctx, id, { forUpdate: true });
    if (l.state !== 'active') {
      throw conflict('Only a live listing can be closed.', { reason: 'not_active' });
    }
    await closeOne(tx, l, 'host', now, userActor(ctx));
  });
  return { state: 'closed' };
}

/**
 * The "Still hiring?" Yes: stamps `confirmed_active_at`. It doesn't change the reminder
 * schedule or the listing's place in Newest.
 */
export async function confirmActive(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
  now: Date = new Date(),
): Promise<{ confirmedActiveAt: Date }> {
  await db.transaction(async (tx) => {
    const l = await loadListing(tx, ctx, id, { forUpdate: true });
    if (l.state !== 'active') {
      throw conflict('Only a live listing can be confirmed.', { reason: 'not_active' });
    }
    await tx.update(listings).set({ confirmedActiveAt: now }).where(eq(listings.id, l.id));
    await record(tx, {
      ...userActor(ctx),
      orgId: ctx.orgId,
      action: 'listings.confirmed_active',
      subjectType: 'listing',
      subjectId: l.id,
    });
  });
  return { confirmedActiveAt: now };
}

/** SP4 apply: whether the listing takes applications now, and on which revision. */
export async function canAcceptApplications(
  db: DbOrTx,
  listingId: string,
  now: Date = new Date(),
): Promise<
  | { ok: true; revisionId: string }
  | { ok: false; reason: 'not_active' | 'org_inactive' | 'deadline_passed' }
> {
  const l = await findListing(db, listingId);
  if (!l || l.state !== 'active' || !l.publishedRevisionId)
    return { ok: false, reason: 'not_active' };
  const org = (await getOrgSummaries(db, [l.orgId])).get(l.orgId);
  if (!org || org.status !== 'active' || org.deleted) return { ok: false, reason: 'org_inactive' };
  const [rev] = await db
    .select({ deadline: listingRevisions.deadline, timezone: listingRevisions.timezone })
    .from(listingRevisions)
    .where(eq(listingRevisions.id, l.publishedRevisionId));
  const closesAt = computeApplicationsCloseAt(rev?.deadline, rev?.timezone ?? 'UTC');
  if (closesAt && now.getTime() >= closesAt.getTime()) {
    return { ok: false, reason: 'deadline_passed' };
  }
  return { ok: true, revisionId: l.publishedRevisionId };
}

/** `listings.still_hiring_sweep` (hourly): one reminder per due listing, guarded by its count. */
export async function stillHiringSweep(db: DbOrTx, now: Date): Promise<void> {
  const due = await db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.state, 'active'),
        lte(listings.nextReminderAt, now),
        isNotNull(listings.firstPublishedAt),
      ),
    )
    .orderBy(asc(listings.nextReminderAt))
    .limit(BATCH);
  for (const l of due) {
    const first = l.firstPublishedAt;
    if (!first) continue;
    await db.transaction(async (tx) => {
      const sent = l.remindersSent + 1;
      const updated = await tx
        .update(listings)
        .set({ remindersSent: sent, nextReminderAt: nextReminderAt(first, sent) })
        .where(
          and(
            eq(listings.id, l.id),
            eq(listings.state, 'active'),
            eq(listings.remindersSent, l.remindersSent),
          ),
        )
        .returning({ id: listings.id });
      if (updated.length === 0) return;
      for (const userId of await teamFor(tx, l, await liveContent(tx, l))) {
        await notify(tx, userId, 'listings.still_hiring', {
          listingId: l.id,
          title: l.title,
          href: href(l.id),
          buttonLabel: 'Answer',
        });
      }
    });
  }
}

/** `listings.auto_close` (hourly): live listings past their end date close with `end_date`. */
export async function autoClose(db: DbOrTx, now: Date): Promise<void> {
  const due = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.state, 'active'), lte(listings.autoCloseAt, now)))
    .orderBy(asc(listings.autoCloseAt))
    .limit(BATCH);
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const l = await findListing(tx, id, { forUpdate: true });
      if (!l || l.state !== 'active' || !l.autoCloseAt || l.autoCloseAt > now) return;
      await closeOne(tx, l, 'end_date', now);
      for (const userId of await teamFor(tx, l, await liveContent(tx, l))) {
        await notify(tx, userId, 'listings.auto_closed', {
          listingId: l.id,
          title: l.title,
          href: href(l.id),
        });
      }
    });
  }
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * `listings.repost_reminders` (daily): a listing that isn't live or removed, first published
 * on the date 8 weeks from today (Feb 29 counts as Feb 28 in a non-leap year), not reposted in
 * the last 12 months and not reminded this year, reminds the Owner and Admins.
 */
export async function repostReminders(db: DbOrTx, now: Date): Promise<void> {
  const target = new Date(now.getTime() + REPOST_LEAD_DAYS * DAY_MS);
  const month = target.getUTCMonth() + 1;
  const day = target.getUTCDate();
  const leapDay = month === 2 && day === 28 && !isLeap(target.getUTCFullYear());
  const year = now.getUTCFullYear();
  const since = new Date(
    Date.UTC(year - 1, now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()),
  );

  const rows = await queryRows<{ id: string }>(
    db,
    sql`
      select l.id from app.listings l
      where l.state not in ('active', 'removed')
        and l.first_published_at is not null
        and (l.repost_reminded_year is null or l.repost_reminded_year <> ${year}::int)
        and extract(month from l.first_published_at at time zone 'UTC')::int = ${month}::int
        and (extract(day from l.first_published_at at time zone 'UTC')::int = ${day}::int
          or (${leapDay}::boolean
            and extract(month from l.first_published_at at time zone 'UTC')::int = 2
            and extract(day from l.first_published_at at time zone 'UTC')::int = 29))
        and not exists (
          select 1 from app.listings r
          where r.reposted_from_id = l.id and r.created_at > ${since}::timestamptz
        )
      order by l.first_published_at
      limit ${BATCH}::int
    `,
  );
  for (const { id } of rows) {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(listings)
        .set({ repostRemindedYear: year })
        .where(
          and(
            eq(listings.id, id),
            sql`${listings.repostRemindedYear} is distinct from ${year}::int`,
          ),
        )
        .returning({ id: listings.id, orgId: listings.orgId, title: listings.title });
      const l = updated[0];
      if (!l) return;
      for (const userId of await ownerAdminUserIds(tx, l.orgId)) {
        await notify(tx, userId, 'listings.repost_reminder', {
          listingId: l.id,
          title: l.title,
          href: href(l.id),
        });
      }
    });
  }
}
