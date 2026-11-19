// What hiring reads from a published listing. Other modules never query listing tables.
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { effectiveEnd, effectiveStart } from '@/lib/discovery';
import type { DbOrTx } from '@/lib/db';
import type { Category } from '@/lib/taxonomy';
import type { ListingContent } from './content';
import { listingRevisions, listings } from './schema';
import type { ListingState } from './types';

export type ListingHiringInfo = {
  id: string;
  orgId: string;
  locationId: string | null;
  title: string;
  status: ListingState;
  category: Category;
  secondCategory: Category | null;
  occupation: string;
  startDate: string | null;
  endDate: string | null;
  when: ListingContent['when'];
  skills: string[];
  requiredCertifications: string[];
  sponsorship: 'none' | 'j1' | 'h2a' | 'h2b';
  state: string | null;
  remoteStates: string[] | 'all_us' | null;
  timezone: string;
  pay: ListingContent['pay'];
  housingProvided: boolean;
  mealsProvided: boolean;
  publishedRevisionId: string | null;
  closedAt: Date | null;
  notifyMemberIds: string[];
  openings: number;
};

type StoredContent = {
  when: ListingContent['when'];
  pay: ListingContent['pay'];
  job: {
    skills: string[];
    certifications: string[];
    visaSponsorship: ListingHiringInfo['sponsorship'];
  };
  applying: { notifyMemberIds: string[] };
};

function toInfo(
  listing: typeof listings.$inferSelect,
  revision: typeof listingRevisions.$inferSelect,
): ListingHiringInfo {
  const content = revision.content as StoredContent;
  const remote = revision.remoteScope === 'all_us' || revision.remoteScope === 'states';
  return {
    id: listing.id,
    orgId: listing.orgId,
    locationId: revision.locationId,
    title: revision.title,
    status: listing.state,
    category: revision.primaryCategory as Category,
    secondCategory: (revision.secondaryCategory as Category | null) ?? null,
    occupation: revision.occupationCode,
    startDate: effectiveStart(content.when),
    endDate: effectiveEnd(content.when),
    when: content.when,
    skills: content.job.skills,
    requiredCertifications: content.job.certifications,
    sponsorship: content.job.visaSponsorship,
    state: remote ? null : revision.stateCode,
    remoteStates:
      revision.remoteScope === 'all_us'
        ? 'all_us'
        : revision.remoteScope === 'states'
          ? (revision.remoteStates ?? [])
          : null,
    timezone: revision.timezone,
    pay: content.pay,
    housingProvided: revision.housingProvided,
    mealsProvided: revision.mealsProvided,
    publishedRevisionId: listing.publishedRevisionId,
    closedAt: listing.closedAt,
    notifyMemberIds: content.applying.notifyMemberIds,
    openings: revision.openings,
  };
}

/** Published revisions only, in the order of `ids`. Drafts and unknown ids are omitted. */
export async function getHiringInfoMany(db: DbOrTx, ids: string[]): Promise<ListingHiringInfo[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ listing: listings, revision: listingRevisions })
    .from(listings)
    .innerJoin(listingRevisions, eq(listings.publishedRevisionId, listingRevisions.id))
    .where(inArray(listings.id, ids));
  const byId = new Map(rows.map((row) => [row.listing.id, row]));
  const out: ListingHiringInfo[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) out.push(toInfo(row.listing, row.revision));
  }
  return out;
}

/** Every listing of the org that was published, newest first. */
export async function listForOrg(
  db: DbOrTx,
  orgId: string,
  o?: { status?: ListingState[] },
): Promise<
  {
    id: string;
    title: string;
    state: ListingState;
    locationId: string | null;
    publishedRevisionId: string | null;
    firstPublishedAt: Date | null;
    closedAt: Date | null;
  }[]
> {
  const filters = [eq(listings.orgId, orgId), isNotNull(listings.firstPublishedAt)];
  if (o?.status && o.status.length > 0) filters.push(inArray(listings.state, o.status));
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      state: listings.state,
      locationId: listings.locationId,
      publishedRevisionId: listings.publishedRevisionId,
      firstPublishedAt: listings.firstPublishedAt,
      closedAt: listings.closedAt,
    })
    .from(listings)
    .where(and(...filters))
    .orderBy(desc(listings.firstPublishedAt));
  return rows.map((row) => ({ ...row, title: row.title ?? '' }));
}
