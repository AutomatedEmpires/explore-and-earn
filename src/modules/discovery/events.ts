// Listing events (views, saves, shares, applies), their daily rollup and counts (SP3 spec
// 8.12). W0 stub: W3 replaces it (Task 24).
//
// Two pieces are wired before then and must not fail: SP2's listing library calls `listingStats`
// through the stats provider registered at load (it returns no stats yet), and the
// `discovery.maintenance` schedule is acknowledged.
import type { DbOrTx } from '@/lib/db';
import type { DiscoverySource, ListingEventType } from '@/lib/discovery';
import type { HandlerMap } from '@/modules/jobs';

export async function recordListingEvent(
  _db: DbOrTx,
  _e: {
    listingId: string;
    type: ListingEventType;
    source: DiscoverySource;
    at?: Date;
    viewerKey?: string | null;
    dedupeKey?: string;
  },
): Promise<void> {
  throw new Error('not implemented: recordListingEvent');
}

/**
 * Event counts for an org's listings over [from, to) (SP5 analytics, SP6 boost reporting).
 * `source` is set on each row only when `sources` is given (Plan decision 6).
 */
export async function getListingEventCounts(
  _db: DbOrTx,
  _i: {
    orgId: string;
    listingIds?: string[];
    from: Date;
    to: Date;
    types: ListingEventType[];
    sources?: DiscoverySource[];
    bucket: 'day' | 'week' | 'none';
  },
): Promise<
  {
    listingId: string;
    bucketStart: string | null;
    type: ListingEventType;
    source: DiscoverySource | null;
    count: number;
  }[]
> {
  throw new Error('not implemented: getListingEventCounts');
}

/** All-time views and saves per listing, for SP2's listing library (internal). */
export async function listingStats(
  _db: DbOrTx,
  _ids: string[],
): Promise<Map<string, { views: number; saves: number }>> {
  // Not a throwing stub: the library calls every registered provider.
  return new Map();
}

/** `<type>:<hmac(viewerKey)>:<listingId>:<30-minute bucket>`. */
export function dedupeKeyFor(
  _type: 'view' | 'share',
  _viewerKey: string,
  _listingId: string,
  _at: Date,
): string {
  throw new Error('not implemented: dedupeKeyFor');
}

const noop = async () => {};

export const eventHandlers: HandlerMap = {
  'discovery.maintenance': noop,
};
