// Repost (spec section 8.2): last season's listing becomes a new draft with its photos and
// screening questions, every date moved forward a year (or more, until it is in the future),
// opening at Review.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { record } from '@/modules/audit';
import type { HostContext } from '@/server/guards';
import { loadListing, userActor } from './access';
import { insertDraftListing } from './drafts';
import { listingRevisions } from './schema';
import { localDate, shiftListingDates } from './time';

const notRepostable = (message: string) => conflict(message, { reason: 'not_repostable' });

/** Copies the live (or last live) content into a new draft. A removed listing can't be reposted. */
export async function repostListing(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
  now: Date = new Date(),
): Promise<{ id: string; openSection: 'review' }> {
  const l = await loadListing(db, ctx, id);
  if (l.state === 'removed') throw notRepostable("A removed listing can't be reposted.");
  if (!l.publishedRevisionId)
    throw notRepostable('Only a listing that was published can be reposted.');

  const [rev] = await db
    .select({ content: listingRevisions.content, timezone: listingRevisions.timezone })
    .from(listingRevisions)
    .where(eq(listingRevisions.id, l.publishedRevisionId));
  if (!rev) throw notRepostable('Only a listing that was published can be reposted.');

  const draft = shiftListingDates(
    structuredClone(rev.content) as Record<string, unknown>,
    localDate(now, rev.timezone),
  );
  const repostId = await db.transaction(async (tx) => {
    const newListingId = await insertDraftListing(tx, ctx, { draft, repostedFromId: l.id });
    await record(tx, {
      ...userActor(ctx),
      orgId: ctx.orgId,
      action: 'listings.reposted',
      subjectType: 'listing',
      subjectId: l.id,
      data: { repostId: newListingId },
    });
    return newListingId;
  });
  return { id: repostId, openSection: 'review' };
}
