// "Ask for a review" (spec sections 5 and 8.4): a host contests a returned or removed listing.
import { desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { badRequest, conflict } from '@/lib/errors';
import { searchAudit } from '@/modules/audit';
import { listOpenReviewItems, openAppeal, openReviewItem } from '@/modules/trust';
import { openVerificationAppeal } from '@/modules/verification';
import type { HostContext } from '@/server/guards';
import { isUuid, loadListing } from './access';
import { REVISION_SUBJECT } from './screening';
import { listingRevisions } from './schema';

export const REVIEW_NOTE_MAX = 1_000;

const nothingToReview = () =>
  conflict('There is nothing to review on this listing.', { reason: 'nothing_to_review' });
const alreadyRequested = () =>
  conflict("You've already asked for a review. We'll let you know when it's done.", {
    reason: 'review_requested',
  });

/**
 * Opens the right review for a listing: an appeal of the removal for a removed listing, a
 * verification appeal when the latest revision was rejected for `verification_failed`, and
 * otherwise a moderation item on the latest rejected revision. The host's note travels with it.
 */
export async function requestReview(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
  note: string,
): Promise<void> {
  const l = await loadListing(db, ctx, id);
  const text = note.trim();
  if (text === '' || text.length > REVIEW_NOTE_MAX) {
    throw badRequest(`Write a note of up to ${REVIEW_NOTE_MAX} characters`);
  }

  if (l.state === 'removed') {
    const { items } = await searchAudit(db, {
      subjectType: 'listing',
      subjectId: l.id,
      action: 'listings.removed',
      limit: 1,
    });
    const itemId = (items[0]?.data as { reviewItemId?: unknown } | null)?.reviewItemId;
    if (!isUuid(itemId)) throw nothingToReview();
    await openAppeal(db, { originalItemId: itemId, reason: text });
    return;
  }

  const [latest] = await db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.listingId, l.id))
    .orderBy(desc(listingRevisions.revisionNumber))
    .limit(1);
  if (!latest || latest.status !== 'rejected') throw nothingToReview();

  const reasons = (latest.checks as { reasons?: unknown } | null)?.reasons;
  if (Array.isArray(reasons) && reasons.includes('verification_failed')) {
    await openVerificationAppeal(db, ctx.orgId, text);
    return;
  }

  if ((await listOpenReviewItems(db, REVISION_SUBJECT, latest.id)).length > 0) {
    throw alreadyRequested();
  }
  await db.transaction(async (tx) => {
    await tx
      .update(listingRevisions)
      .set({
        checks: {
          ...(latest.checks ?? {}),
          reviewRequest: { note: text, at: new Date().toISOString(), by: ctx.user.id },
        },
      })
      .where(eq(listingRevisions.id, latest.id));
    await openReviewItem(tx, {
      queue: 'moderation',
      subjectType: REVISION_SUBJECT,
      subjectId: latest.id,
      reason: 'host_requested_review',
    });
  });
}
