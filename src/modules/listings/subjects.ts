// What operator decisions do to listings (spec section 6, subject handlers). trust.decide calls
// these inside the decision's transaction, with `data.reviewItemId` naming the deciding item.
// Registered when the module loads (index imports this file).
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { sanctionOrg } from '@/modules/billing';
import { withCapacity } from '@/modules/entitlements';
import { emit } from '@/modules/jobs';
import { notify } from '@/modules/notifications';
import { listOpenReviewItems, registerSubjectHandlers, type SubjectHandler } from '@/modules/trust';
import { findListing, isUuid } from './access';
import { publishRevision, rejectRevision, revisionUnderReview, teamFor } from './publish';
import { REVISION_SUBJECT } from './screening';
import { listingRevisions, listings } from './schema';
import { ownerAdminUserIds, union } from './team';

export const LISTING_SUBJECT = 'listing';

const OPERATOR = { type: 'operator' as const, id: null };

type DecisionData = { note?: string; reviewItemId?: string };
const dataOf = (data: unknown): DecisionData =>
  typeof data === 'object' && data !== null ? (data as DecisionData) : {};

async function loadRevision(db: DbOrTx, id: string) {
  if (!isUuid(id)) return null;
  const [rev] = await db.select().from(listingRevisions).where(eq(listingRevisions.id, id));
  return rev ?? null;
}

/**
 * Publishes a rejected revision again after an operator approved the host's review request,
 * if a slot is free; otherwise it stays rejected and `listings.returned` names
 * `listing_slot_limit`.
 */
async function republishRejected(
  db: DbOrTx,
  rev: NonNullable<Awaited<ReturnType<typeof loadRevision>>>,
  now: Date,
): Promise<void> {
  const l = await findListing(db, rev.listingId);
  if (!l || l.state === 'closed' || l.state === 'removed') return;
  if (l.state === 'in_review' || l.pendingRevisionId !== null) return;
  try {
    await db.transaction(async (tx) => {
      await withCapacity(tx, l.orgId, 'listing_slot', l.state === 'active' ? 0 : 1, async () => {
        await tx
          .update(listingRevisions)
          .set({ status: 'in_review' })
          .where(eq(listingRevisions.id, rev.id));
        await tx
          .update(listings)
          .set(
            l.state === 'active'
              ? { pendingRevisionId: rev.id, reviewStage: 'moderation' }
              : { state: 'in_review', reviewStage: 'moderation' },
          )
          .where(eq(listings.id, l.id));
        await publishRevision(tx, rev.id, now);
      });
    });
  } catch (err) {
    const reason = isAppError(err)
      ? (err.details as { reason?: string } | undefined)?.reason
      : null;
    if (reason !== 'listing_slot_limit') throw err;
    for (const userId of await teamFor(db, l, rev.content)) {
      await notify(db, userId, 'listings.returned', {
        listingId: l.id,
        title: rev.title,
        reasons: ['listing_slot_limit'],
        href: `/host/listings/${l.id}`,
      });
    }
  }
}

const sanctionVia =
  (
    action: 'suspend' | 'ban',
    orgOf: (db: DbOrTx, id: string) => Promise<string | null>,
  ): SubjectHandler =>
  async (db, subjectId) => {
    const orgId = await orgOf(db, subjectId);
    if (orgId) await sanctionOrg(db, orgId, action, OPERATOR);
  };

const revisionOrg = async (db: DbOrTx, id: string) => (await loadRevision(db, id))?.orgId ?? null;
const listingOrg = async (db: DbOrTx, id: string) => (await findListing(db, id))?.orgId ?? null;

registerSubjectHandlers(REVISION_SUBJECT, {
  // Publishes once no other item on the revision is open (moderation and fraud both approve).
  approve: async (db, revisionId, data) => {
    const itemId = dataOf(data).reviewItemId;
    const open = await listOpenReviewItems(db, REVISION_SUBJECT, revisionId);
    if (open.some((i) => i.id !== itemId)) return;
    const rev = await loadRevision(db, revisionId);
    if (!rev) return;
    const now = new Date();
    if (rev.status === 'screening' || rev.status === 'in_review') {
      await publishRevision(db, rev.id, now);
    } else if (rev.status === 'rejected') {
      await republishRejected(db, rev, now);
    }
  },
  remove: async (db, revisionId) => {
    await rejectRevision(db, revisionId, ['moderation'], new Date());
  },
  ask_info: async (db, revisionId, data) => {
    await rejectRevision(db, revisionId, ['ask_info'], new Date(), dataOf(data).note);
  },
  suspend: sanctionVia('suspend', revisionOrg),
  ban: sanctionVia('ban', revisionOrg),
});

/** Takes a listing down: `removed`, its slot freed and any pending edit rejected. */
async function removeListing(db: DbOrTx, listingId: string, reviewItemId: string | undefined) {
  await db.transaction(async (tx) => {
    const l = await findListing(tx, listingId, { forUpdate: true });
    if (!l || l.state === 'removed') return;
    const now = new Date();
    const pending = await revisionUnderReview(tx, l);
    if (pending && (pending.status === 'screening' || pending.status === 'in_review')) {
      await tx
        .update(listingRevisions)
        .set({ status: 'rejected', decidedAt: now, checks: { reasons: ['listing_removed'] } })
        .where(eq(listingRevisions.id, pending.id));
    }
    await tx
      .update(listings)
      .set({ state: 'removed', removedAt: now, reviewStage: null, pendingRevisionId: null })
      .where(eq(listings.id, l.id));
    await emit(
      tx,
      'listing.removed',
      { listingId: l.id, orgId: l.orgId, reason: 'moderation' },
      newId(),
    );
    await record(tx, {
      actorType: 'operator',
      actorId: null,
      orgId: l.orgId,
      action: 'listings.removed',
      subjectType: 'listing',
      subjectId: l.id,
      data: { reviewItemId: reviewItemId ?? null, previousState: l.state },
    });

    const live = l.publishedRevisionId ? await loadRevision(tx, l.publishedRevisionId) : null;
    const recipients = union(
      await teamFor(tx, l, live?.content ?? l.draft),
      await ownerAdminUserIds(tx, l.orgId),
    );
    for (const userId of recipients) {
      await notify(tx, userId, 'listings.removed', {
        listingId: l.id,
        title: l.title,
        href: `/host/listings/${l.id}`,
      });
    }
  });
}

registerSubjectHandlers(LISTING_SUBJECT, {
  // A report on the listing is dismissed; nothing changes.
  approve: async () => {},
  remove: async (db, listingId, data) => {
    await removeListing(db, listingId, dataOf(data).reviewItemId);
  },
  ask_info: async (db, listingId, data) => {
    const l = await findListing(db, listingId);
    if (!l) return;
    const live = l.publishedRevisionId ? await loadRevision(db, l.publishedRevisionId) : null;
    const note = dataOf(data).note;
    for (const userId of await teamFor(db, l, live?.content ?? l.draft)) {
      await notify(db, userId, 'listings.returned', {
        listingId: l.id,
        title: l.title,
        reasons: ['ask_info'],
        ...(note ? { note } : {}),
        href: `/host/listings/${l.id}`,
      });
    }
  },
  suspend: sanctionVia('suspend', listingOrg),
  ban: sanctionVia('ban', listingOrg),
});
