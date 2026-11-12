// Publishing (spec section 8.3 step 1 and decision step 6): the synchronous publish request
// under slot capacity, team approval, and the two revision outcomes. Screening (screening.ts)
// runs between them as an outbox job.
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import { AppError, badRequest, conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import { getSubscriptionState } from '@/modules/billing';
import { withCapacity } from '@/modules/entitlements';
import { emit, enqueue } from '@/modules/jobs';
import { getLocations } from '@/modules/locations';
import { notify } from '@/modules/notifications';
import { getOrgSummaries } from '@/modules/orgs';
import { getVerificationStatus } from '@/modules/verification';
import type { HostContext } from '@/server/guards';
import { findListing, loadListing, userActor, type ListingRecord } from './access';
import { ackKey, runListingChecks, sourceGenreOf } from './checks';
import type { ListingContent } from './content';
import { nextRevisionNumber } from './drafts';
import { toRevisionColumns } from './revision-columns';
import { listingRevisions, listings, type REVIEW_STAGES } from './schema';
import './notifications';
import { listingTeamUserIds, notifyMemberIdsOf, ownerAdminUserIds } from './team';
import { computeAutoCloseAt, nextReminderAt } from './time';

export const SCREEN_TOPIC = 'listings.screen';

type ReviewStage = (typeof REVIEW_STAGES)[number];
type RevisionRecord = typeof listingRevisions.$inferSelect;

export type PublishState = { state: ListingRecord['state']; reviewStage: ReviewStage | null };

/** Queues the screening job for a revision (spec section 6: dedupe `screen:<revisionId>`). */
export async function enqueueScreen(db: DbOrTx, revisionId: string): Promise<void> {
  await enqueue(db, {
    topic: SCREEN_TOPIC,
    payload: { revisionId, attempt: 0 },
    dedupeKey: `screen:${revisionId}`,
  });
}

/** The revision a listing in review is waiting on: its pending edit, or its newest one. */
export async function revisionUnderReview(
  db: DbOrTx,
  l: ListingRecord,
): Promise<RevisionRecord | null> {
  if (l.pendingRevisionId) {
    const [r] = await db
      .select()
      .from(listingRevisions)
      .where(eq(listingRevisions.id, l.pendingRevisionId));
    return r ?? null;
  }
  if (l.state !== 'in_review') return null;
  const [r] = await db
    .select()
    .from(listingRevisions)
    .where(
      and(
        eq(listingRevisions.listingId, l.id),
        inArray(listingRevisions.status, ['screening', 'in_review']),
      ),
    )
    .orderBy(desc(listingRevisions.revisionNumber))
    .limit(1);
  return r ?? null;
}

/** The listing team for a revision's content (creator plus named members). */
export function teamFor(db: DbOrTx, l: ListingRecord, content: unknown): Promise<string[]> {
  return listingTeamUserIds(db, {
    id: l.id,
    orgId: l.orgId,
    createdBy: l.createdBy,
    locationId: l.locationId,
    notifyMemberIds: notifyMemberIdsOf(content),
  });
}

async function notifyAll(
  db: DbOrTx,
  userIds: string[],
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  for (const userId of new Set(userIds)) await notify(db, userId, type, data);
}

const listingHref = (id: string) => `/host/listings/${id}`;

/** Org, billing and verification gates for publishing new content. */
async function assertMayPublish(db: DbOrTx, orgId: string): Promise<void> {
  const org = (await getOrgSummaries(db, [orgId])).get(orgId);
  if (!org || org.status !== 'active' || org.deleted) {
    throw conflict("Your organization can't publish listings right now.", {
      reason: 'org_suspended',
    });
  }
  const sub = await getSubscriptionState(db, orgId);
  if (!sub.entitled) {
    throw conflict('Choose a plan to publish listings.', { reason: 'not_entitled' });
  }
  if (!sub.canPublish) {
    if (sub.status === 'past_due') {
      throw conflict(
        "Your last payment didn't go through. Update your payment method to publish new listings.",
        { reason: 'past_due' },
      );
    }
    throw conflict('Choose a plan to publish listings.', { reason: 'not_entitled' });
  }
  if ((await getVerificationStatus(db, orgId)) === 'failed') {
    throw conflict("We couldn't verify your business. Ask for a review to publish listings.", {
      reason: 'verification_failed',
    });
  }
}

function assertPublishableState(l: ListingRecord): void {
  if (l.state === 'in_review' || l.pendingRevisionId !== null) {
    throw conflict('This listing is already being checked.', { reason: 'already_in_review' });
  }
  if (l.state === 'closed' || l.state === 'removed') {
    throw conflict("This listing can't be published again. Repost it instead.", {
      reason: 'not_publishable',
    });
  }
}

/**
 * Asks to publish the draft (a new listing, or an edit of a live one). Throws 409 for the org,
 * billing, verification and state gates; 400 with `details.issues` for blocking issues or
 * unacknowledged warnings; and 409 `listing_slot_limit` when no slot is free. Queues screening
 * (or asks the Owner and Admins to approve a Recruiter's listing). The caller kicks the worker
 * after it returns.
 */
export async function requestPublish(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
  acknowledgedWarnings: string[],
  now: Date = new Date(),
): Promise<PublishState> {
  const l = await loadListing(db, ctx, id);
  await assertMayPublish(db, ctx.orgId);

  const checks = await runListingChecks(db, {
    orgId: ctx.orgId,
    listing: {
      id: l.id,
      firstPublishedAt: l.firstPublishedAt,
      sourceGenre: await sourceGenreOf(db, l),
    },
    draft: l.draft,
    now,
  });
  if (checks.errors.length > 0 || !checks.parsed) {
    throw badRequest('Fix these before you publish.', { issues: checks.errors });
  }
  const acked = new Set(acknowledgedWarnings);
  const unacked = checks.warnings.filter((w) => !acked.has(ackKey(w)));
  if (unacked.length > 0) {
    throw badRequest('Check these before you publish.', { issues: unacked });
  }
  assertPublishableState(l);

  const content = checks.parsed;
  const locationId =
    content.where.mode === 'remote' ? content.where.hostLocationId : content.where.locationId;
  const location = (await getLocations(db, [locationId])).get(locationId);
  if (!location) throw new AppError('internal', 'The listing location is missing');

  const org = (await getOrgSummaries(db, [ctx.orgId])).get(ctx.orgId);
  const stage: ReviewStage =
    ctx.role === 'recruiter' && org?.requireRecruiterApproval ? 'team_approval' : 'screening';

  return db.transaction(async (tx) => {
    const current = await loadListing(tx, ctx, id, { forUpdate: true });
    assertPublishableState(current);
    const editing = current.state === 'active';

    return withCapacity(tx, ctx.orgId, 'listing_slot', editing ? 0 : 1, async () => {
      const revisionId = newId();
      await tx.insert(listingRevisions).values({
        id: revisionId,
        listingId: current.id,
        orgId: ctx.orgId,
        revisionNumber: await nextRevisionNumber(tx, current.id),
        status: 'screening',
        content,
        ...toRevisionColumns(content, {
          timezone: location.timezone,
          publicPoint: location.publicPoint,
          stateCode: location.state,
        }),
        acknowledgedWarnings: checks.warnings.map(ackKey),
        submittedBy: ctx.user.id,
        submittedAt: now,
      });

      await tx
        .update(listings)
        .set({
          draft: content,
          reviewStage: stage,
          ...(editing ? { pendingRevisionId: revisionId } : { state: 'in_review' as const }),
        })
        .where(eq(listings.id, current.id));

      if (stage === 'screening') {
        await enqueueScreen(tx, revisionId);
      } else {
        await notifyAll(tx, await ownerAdminUserIds(tx, ctx.orgId), 'listings.approval_requested', {
          listingId: current.id,
          title: content.basics.title,
          href: listingHref(current.id),
        });
      }

      await record(tx, {
        ...userActor(ctx),
        orgId: ctx.orgId,
        action: 'listings.publish_requested',
        subjectType: 'listing',
        subjectId: current.id,
        data: {
          revisionId,
          stage,
          edit: editing,
          acknowledgedWarnings: checks.warnings.map(ackKey),
        },
      });

      return { state: editing ? 'active' : 'in_review', reviewStage: stage } satisfies PublishState;
    });
  });
}

/**
 * An Owner's or Admin's decision on a Recruiter's listing at `team_approval`: approve sends it
 * to screening; return rejects the revision with `returned_by_team`. Either way the submitter
 * gets `listings.approval_decided`.
 */
export async function decideApproval(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
  decision: 'approve' | 'return',
  note?: string,
  now: Date = new Date(),
): Promise<PublishState> {
  return db.transaction(async (tx) => {
    const l = await loadListing(tx, ctx, id, { forUpdate: true });
    if (l.reviewStage !== 'team_approval') {
      throw conflict('This listing is not waiting for approval.', {
        reason: 'not_awaiting_approval',
      });
    }
    const rev = await revisionUnderReview(tx, l);
    if (!rev)
      throw conflict('This listing is not waiting for approval.', {
        reason: 'not_awaiting_approval',
      });
    const cleanNote = note?.trim().slice(0, 1_000) || undefined;

    if (decision === 'approve') {
      await tx.update(listings).set({ reviewStage: 'screening' }).where(eq(listings.id, l.id));
      await enqueueScreen(tx, rev.id);
    } else {
      await rejectRevision(tx, rev.id, ['returned_by_team'], now, cleanNote);
    }

    if (rev.submittedBy) {
      await notify(tx, rev.submittedBy, 'listings.approval_decided', {
        listingId: l.id,
        title: rev.title,
        decision,
        ...(cleanNote ? { note: cleanNote } : {}),
        href: listingHref(l.id),
      });
    }
    await record(tx, {
      ...userActor(ctx),
      orgId: ctx.orgId,
      action: 'listings.approval_decided',
      subjectType: 'listing',
      subjectId: l.id,
      data: { revisionId: rev.id, decision, ...(cleanNote ? { note: cleanNote } : {}) },
    });

    const [after] = await tx
      .select({ state: listings.state, reviewStage: listings.reviewStage })
      .from(listings)
      .where(eq(listings.id, l.id));
    return { state: after?.state ?? l.state, reviewStage: after?.reviewStage ?? null };
  });
}

async function lockRevision(tx: Tx, revisionId: string): Promise<RevisionRecord> {
  const [rev] = await tx
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.id, revisionId))
    .for('update');
  if (!rev) throw notFound('Revision not found');
  return rev;
}

/**
 * Makes a revision live, in one transaction: the revision is approved (the previous live one
 * superseded) and the listing active, with its publish, reminder and auto-close times. Emits
 * `listing.published` on the first publish (else `listing.changed`), records
 * `listings.published` and tells the listing team. A no-op for an approved revision or a
 * listing that was closed or removed meanwhile.
 */
export async function publishRevision(db: DbOrTx, revisionId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const rev = await lockRevision(tx, revisionId);
    if (rev.status !== 'screening' && rev.status !== 'in_review') return;
    const l = await findListing(tx, rev.listingId, { forUpdate: true });
    if (!l) throw notFound('Listing not found');
    if (l.state === 'closed' || l.state === 'removed' || l.state === 'draft') {
      logger.warn('publishRevision: listing is no longer under review', {
        listingId: l.id,
        revisionId,
        state: l.state,
      });
      return;
    }

    if (l.publishedRevisionId && l.publishedRevisionId !== rev.id) {
      await tx
        .update(listingRevisions)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(listingRevisions.id, l.publishedRevisionId),
            eq(listingRevisions.status, 'approved'),
          ),
        );
    }
    await tx
      .update(listingRevisions)
      .set({ status: 'approved', decidedAt: now })
      .where(eq(listingRevisions.id, rev.id));

    const content = rev.content as ListingContent;
    const first = l.firstPublishedAt === null;
    const firstPublishedAt = l.firstPublishedAt ?? now;
    await tx
      .update(listings)
      .set({
        state: 'active',
        publishedRevisionId: rev.id,
        pendingRevisionId: null,
        reviewStage: null,
        publishedAt: now,
        firstPublishedAt,
        autoCloseAt: computeAutoCloseAt(content.when, rev.timezone),
        nextReminderAt: nextReminderAt(firstPublishedAt, l.remindersSent),
        title: rev.title,
        locationId: rev.locationId,
      })
      .where(eq(listings.id, l.id));

    if (first) {
      await emit(
        tx,
        'listing.published',
        { listingId: l.id, revisionId: rev.id, orgId: l.orgId, first: true },
        newId(),
      );
    } else {
      await emit(
        tx,
        'listing.changed',
        { listingId: l.id, revisionId: rev.id, orgId: l.orgId },
        newId(),
      );
    }
    await record(tx, {
      actorType: 'system',
      actorId: null,
      orgId: l.orgId,
      action: 'listings.published',
      subjectType: 'listing',
      subjectId: l.id,
      data: { revisionId: rev.id, first, revisionNumber: rev.revisionNumber },
    });
    await notifyAll(tx, await teamFor(tx, l, content), 'listings.live', {
      listingId: l.id,
      title: rev.title,
      href: listingHref(l.id),
    });
  });
}

/**
 * Rejects a revision under review. A listing that was never live returns to draft (freeing its
 * slot); a rejected edit leaves the live revision in place. Records `listings.revision_rejected`
 * and tells the listing team (`listings.returned`, with the reasons). A no-op once decided.
 */
export async function rejectRevision(
  db: DbOrTx,
  revisionId: string,
  reasons: string[],
  now: Date,
  note?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const rev = await lockRevision(tx, revisionId);
    if (rev.status !== 'screening' && rev.status !== 'in_review') return;
    await tx
      .update(listingRevisions)
      .set({
        status: 'rejected',
        decidedAt: now,
        checks: { ...(rev.checks ?? {}), reasons, ...(note ? { note } : {}) },
      })
      .where(eq(listingRevisions.id, rev.id));

    const l = await findListing(tx, rev.listingId, { forUpdate: true });
    if (!l) return;
    if (l.pendingRevisionId === rev.id) {
      await tx
        .update(listings)
        .set({ pendingRevisionId: null, reviewStage: null })
        .where(eq(listings.id, l.id));
    } else if (l.state === 'in_review' && l.publishedRevisionId === null) {
      await tx
        .update(listings)
        .set({ state: 'draft', reviewStage: null })
        .where(eq(listings.id, l.id));
    }

    await record(tx, {
      actorType: 'system',
      actorId: null,
      orgId: l.orgId,
      action: 'listings.revision_rejected',
      subjectType: 'listing',
      subjectId: l.id,
      data: { revisionId: rev.id, reasons, ...(note ? { note } : {}) },
    });
    await notifyAll(tx, await teamFor(tx, l, rev.content), 'listings.returned', {
      listingId: l.id,
      title: rev.title,
      reasons,
      ...(note ? { note } : {}),
      href: listingHref(l.id),
    });
  });
}
