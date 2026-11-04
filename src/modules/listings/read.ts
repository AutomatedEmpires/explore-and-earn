// Read APIs for other modules and sub-projects (spec section 3): live listings and revisions,
// summaries in every state, the SP3 backfill, and per-org and per-location counts.
import { and, asc, count, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { CATEGORIES, type Category } from '@/lib/taxonomy';
import { isUuid, type ListingRecord } from './access';
import type { ListingContent } from './content';
import { listingRevisions, listings } from './schema';
import { computeApplicationsCloseAt, computeAutoCloseAt } from './time';
import type { ListingState, ListingSummary, PublishedListing } from './types';

type RevisionRecord = typeof listingRevisions.$inferSelect;

const isCategory = (v: unknown): v is Category =>
  typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);

function toPublished(l: ListingRecord, rev: RevisionRecord): PublishedListing {
  const content = rev.content as ListingContent;
  return {
    listingId: l.id,
    revisionId: rev.id,
    orgId: l.orgId,
    content,
    firstPublishedAt: l.firstPublishedAt ?? rev.decidedAt ?? rev.createdAt,
    publishedAt: l.publishedAt ?? rev.decidedAt ?? rev.createdAt,
    confirmedActiveAt: l.confirmedActiveAt,
    autoCloseAt: computeAutoCloseAt(content.when, rev.timezone),
    applicationsCloseAt: computeApplicationsCloseAt(rev.deadline, rev.timezone),
    provenance: l.provenance,
  };
}

/** The live revision of an `active` listing, else null. */
export async function getPublishedListing(
  db: DbOrTx,
  listingId: string,
): Promise<PublishedListing | null> {
  if (!isUuid(listingId)) return null;
  const [row] = await db
    .select({ l: listings, r: listingRevisions })
    .from(listings)
    .innerJoin(listingRevisions, eq(listingRevisions.id, listings.publishedRevisionId))
    .where(and(eq(listings.id, listingId), eq(listings.state, 'active')));
  return row ? toPublished(row.l, row.r) : null;
}

/** Any revision, with its listing's current state (SP4 snapshots). `not_found` when unknown. */
export async function getRevision(
  db: DbOrTx,
  revisionId: string,
): Promise<PublishedListing & { state: ListingState }> {
  if (!isUuid(revisionId)) throw notFound('Revision not found');
  const [row] = await db
    .select({ l: listings, r: listingRevisions })
    .from(listingRevisions)
    .innerJoin(listings, eq(listings.id, listingRevisions.listingId))
    .where(eq(listingRevisions.id, revisionId));
  if (!row) throw notFound('Revision not found');
  return { ...toPublished(row.l, row.r), state: row.l.state };
}

/** Active listings by id, for the SP3 search backfill. `next` is the cursor for `after`. */
export async function listActiveListings(
  db: DbOrTx,
  i: { after?: string; limit: number },
): Promise<{ items: PublishedListing[]; next: string | null }> {
  const limit = Math.min(Math.max(Math.floor(i.limit), 1), 500);
  const rows = await db
    .select({ l: listings, r: listingRevisions })
    .from(listings)
    .innerJoin(listingRevisions, eq(listingRevisions.id, listings.publishedRevisionId))
    .where(
      and(
        eq(listings.state, 'active'),
        i.after && isUuid(i.after) ? gt(listings.id, i.after) : undefined,
      ),
    )
    .orderBy(asc(listings.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    items: page.map((row) => toPublished(row.l, row.r)),
    next: rows.length > limit ? (page.at(-1)?.l.id ?? null) : null,
  };
}

/** Summaries of listings in any state, closed and removed included. Unknown ids are omitted. */
export async function getListingSummaries(
  db: DbOrTx,
  ids: string[],
): Promise<Map<string, ListingSummary>> {
  const wanted = [...new Set(ids.filter(isUuid))];
  const out = new Map<string, ListingSummary>();
  if (wanted.length === 0) return out;
  const rows = await db
    .select({ l: listings, category: listingRevisions.primaryCategory })
    .from(listings)
    .leftJoin(listingRevisions, eq(listingRevisions.id, listings.publishedRevisionId))
    .where(inArray(listings.id, wanted));
  for (const { l, category } of rows) {
    const draftCategory = (l.draft as { basics?: { primaryCategory?: unknown } }).basics
      ?.primaryCategory;
    out.set(l.id, {
      orgId: l.orgId,
      title: l.title ?? '',
      state: l.state,
      locationId: l.locationId,
      primaryCategory: isCategory(category)
        ? category
        : isCategory(draftCategory)
          ? draftCategory
          : 'seasonal',
      publishedRevisionId: l.publishedRevisionId,
    });
  }
  return out;
}

/** Active listings per location (location archiving, host page groups). */
export async function countActiveByLocation(
  db: DbOrTx,
  locationIds: string[],
): Promise<Map<string, number>> {
  const wanted = [...new Set(locationIds.filter(isUuid))];
  const out = new Map<string, number>(wanted.map((id) => [id, 0]));
  if (wanted.length === 0) return out;
  const rows = await db
    .select({ locationId: listings.locationId, n: count() })
    .from(listings)
    .where(and(eq(listings.state, 'active'), inArray(listings.locationId, wanted)))
    .groupBy(listings.locationId);
  for (const r of rows) if (r.locationId) out.set(r.locationId, Number(r.n));
  return out;
}

/** Active listings per org. */
export async function getOrgListingStats(
  db: DbOrTx,
  orgIds: string[],
): Promise<Map<string, { active: number }>> {
  const wanted = [...new Set(orgIds.filter(isUuid))];
  const out = new Map<string, { active: number }>(wanted.map((id) => [id, { active: 0 }]));
  if (wanted.length === 0) return out;
  const rows = await db
    .select({ orgId: listings.orgId, n: count() })
    .from(listings)
    .where(and(eq(listings.state, 'active'), inArray(listings.orgId, wanted)))
    .groupBy(listings.orgId);
  for (const r of rows) out.set(r.orgId, { active: Number(r.n) });
  return out;
}

/** The host page's live jobs and its hiring history ("Usually hires"). */
export async function getOrgListingFacts(
  db: DbOrTx,
  orgId: string,
): Promise<{
  active: PublishedListing[];
  history: { firstPublishedAt: Date; primaryCategory: Category }[];
}> {
  if (!isUuid(orgId)) return { active: [], history: [] };
  const rows = await db
    .select({ l: listings, r: listingRevisions })
    .from(listings)
    .innerJoin(listingRevisions, eq(listingRevisions.id, listings.publishedRevisionId))
    .where(and(eq(listings.orgId, orgId), isNotNull(listings.firstPublishedAt)))
    .orderBy(asc(listings.firstPublishedAt), asc(listings.id));
  return {
    active: rows.filter((row) => row.l.state === 'active').map((row) => toPublished(row.l, row.r)),
    history: rows.flatMap((row) =>
      row.l.firstPublishedAt
        ? [
            {
              firstPublishedAt: row.l.firstPublishedAt,
              primaryCategory: isCategory(row.r.primaryCategory)
                ? row.r.primaryCategory
                : 'seasonal',
            },
          ]
        : [],
    ),
  };
}
