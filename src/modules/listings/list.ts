// The host listings screen (spec sections 5 and 7): the Active, Drafts and Library tabs, within
// the member's recruiter scope, newest first, with stats and row badges from providers.
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getCapacity } from '@/modules/entitlements';
import { getListingAccess } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';
import { isUuid, type ListingRecord } from './access';
import { loadListingBadges, loadListingStats } from './providers';
import { listingRevisions, listings } from './schema';
import type { ListingStats } from './types';

export const LISTINGS_PAGE_SIZE = 25;

export type ListingTab = 'active' | 'drafts' | 'library';

export type ListingRow = {
  id: string;
  title: string | null;
  state: ListingRecord['state'];
  reviewStage: ListingRecord['reviewStage'];
  locationId: string | null;
  firstPublishedAt: Date | null;
  publishedAt: Date | null;
  closedAt: Date | null;
  closeReason: ListingRecord['closeReason'];
  confirmedActiveAt: Date | null;
  /** Published, with a draft that differs from the live content. */
  hasUnpublishedChanges: boolean;
  stats: ListingStats | null;
  badge: { label: string; href: string } | null;
};

const TAB_FILTER: Record<ListingTab, SQL | undefined> = {
  active: inArray(listings.state, ['active', 'in_review']),
  drafts: and(isNull(listings.firstPublishedAt), eq(listings.state, 'draft')),
  library: isNotNull(listings.firstPublishedAt),
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/** One page (25) of the org's listings in a tab, newest first; `before` is the cursor. */
export async function listOrgListings(
  db: DbOrTx,
  ctx: HostContext,
  i: { tab: ListingTab; q?: string; locationId?: string; before?: string },
): Promise<{
  items: ListingRow[];
  nextBefore: string | null;
  slots: { used: number; limit: number };
}> {
  const capacity = await getCapacity(db, ctx.orgId, 'listing_slot');
  const slots = { used: capacity.used, limit: capacity.limit };
  const access = await getListingAccess(db, ctx);

  let scope: SQL | undefined;
  if (!access.all) {
    const parts = [
      access.listingIds.length > 0 ? inArray(listings.id, access.listingIds) : undefined,
      access.locationIds.length > 0 ? inArray(listings.locationId, access.locationIds) : undefined,
    ].filter((p): p is SQL => p !== undefined);
    if (parts.length === 0) return { items: [], nextBefore: null, slots };
    scope = or(...parts);
  }

  const q = i.q?.trim();
  const rows = await db
    .select({
      l: listings,
      changed: sql<boolean>`coalesce(${listings.draft} <> ${listingRevisions.content}, false)`,
    })
    .from(listings)
    .leftJoin(listingRevisions, eq(listingRevisions.id, listings.publishedRevisionId))
    .where(
      and(
        eq(listings.orgId, ctx.orgId),
        TAB_FILTER[i.tab],
        scope,
        q ? ilike(listings.title, `%${escapeLike(q)}%`) : undefined,
        i.locationId && isUuid(i.locationId) ? eq(listings.locationId, i.locationId) : undefined,
        i.locationId && !isUuid(i.locationId) ? sql`false` : undefined,
        i.before && isUuid(i.before) ? lt(listings.id, i.before) : undefined,
      ),
    )
    .orderBy(desc(listings.id))
    .limit(LISTINGS_PAGE_SIZE + 1);

  const page = rows.slice(0, LISTINGS_PAGE_SIZE);
  const ids = page.map((r) => r.l.id);
  const [stats, badges] = await Promise.all([
    loadListingStats(db, ids),
    loadListingBadges(db, ctx.orgId, ids),
  ]);

  return {
    items: page.map(({ l, changed }) => ({
      id: l.id,
      title: l.title,
      state: l.state,
      reviewStage: l.reviewStage,
      locationId: l.locationId,
      firstPublishedAt: l.firstPublishedAt,
      publishedAt: l.publishedAt,
      closedAt: l.closedAt,
      closeReason: l.closeReason,
      confirmedActiveAt: l.confirmedActiveAt,
      hasUnpublishedChanges: l.publishedRevisionId !== null && changed === true,
      stats: stats?.get(l.id) ?? null,
      badge: badges.get(l.id) ?? null,
    })),
    nextBefore: rows.length > LISTINGS_PAGE_SIZE ? (page.at(-1)?.l.id ?? null) : null,
    slots,
  };
}
