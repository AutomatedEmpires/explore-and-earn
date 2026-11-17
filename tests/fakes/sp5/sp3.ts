// In-memory SP3 for SP5 tests.
import type { DbOrTx } from '@/lib/db';
import type { DiscoverySource, JobCardData, ListingEventType } from '@/lib/discovery';
import type { ListingContent } from '@/modules/listings';

type Discovery = typeof import('@/modules/discovery');
type Call = { name: string; args: unknown[] };

type EventRow = {
  listingId: string;
  bucketStart: string | null;
  type: ListingEventType;
  source: DiscoverySource | null;
  count: number;
};

const events: EventRow[] = [];
const cards = new Map<string, JobCardData>();
const calls: Call[] = [];

export function resetDiscovery(): void {
  events.length = 0;
  cards.clear();
  calls.length = 0;
}

export function setEventCounts(rows: EventRow[]): void {
  events.length = 0;
  events.push(...rows);
}

export function setJobCard(listingId: string, card: JobCardData): void {
  cards.set(listingId, card);
}

async function getListingEventCounts(
  _db: DbOrTx,
  i: {
    orgId: string;
    listingIds?: string[];
    from: Date;
    to: Date;
    types: ListingEventType[];
    sources?: DiscoverySource[];
    bucket: 'day' | 'week' | 'none';
  },
): Promise<EventRow[]> {
  calls.push({ name: 'getListingEventCounts', args: [i] });
  return events.filter((row) => {
    if (i.listingIds && !i.listingIds.includes(row.listingId)) return false;
    if (!i.types.includes(row.type)) return false;
    if (i.sources && row.source !== null && !i.sources.includes(row.source)) return false;
    return true;
  });
}

async function getJobCards(
  _db: DbOrTx,
  listingIds: string[],
  opts?: { viewerUserId?: string | null; tz?: string },
): Promise<JobCardData[]> {
  calls.push({ name: 'getJobCards', args: [listingIds, opts] });
  return listingIds.flatMap((id) => {
    const card = cards.get(id);
    return card ? [card] : [];
  });
}

function toHourlyCents(c: Pick<ListingContent, 'pay' | 'when'>): {
  minCents: number | null;
  maxCents: number | null;
} {
  calls.push({ name: 'toHourlyCents', args: [c] });
  if (c.pay.unit !== 'hour') return { minCents: null, maxCents: null };
  return { minCents: c.pay.minCents, maxCents: c.pay.maxCents };
}

export const discoveryFake = {
  getListingEventCounts,
  getJobCards,
  toHourlyCents,
  setEventCounts,
  setJobCard,
  reset: resetDiscovery,
  calls,
} satisfies Partial<Discovery> & {
  setEventCounts: typeof setEventCounts;
  setJobCard: typeof setJobCard;
  reset: typeof resetDiscovery;
  calls: Call[];
};
