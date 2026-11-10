// Map pins, server clusters and the location preview (SP3 spec 8.6). W0 stub: W2 replaces it
// (Task 20).
import type { DbOrTx } from '@/lib/db';
import type { DiscoveryQuery, HostPreview, JobCardData, MapCluster, MapPin } from '@/lib/discovery';

export async function mapPins(
  _db: DbOrTx,
  _i: {
    query: DiscoveryQuery;
    bbox: [number, number, number, number];
    zoom: number;
    viewerUserId: string | null;
  },
): Promise<{ pins: MapPin[]; clusters: MapCluster[]; capped: boolean }> {
  throw new Error('not implemented: mapPins');
}

/** Null when the location has no active listing. */
export async function locationPreview(
  _db: DbOrTx,
  _i: {
    locationId: string;
    query: DiscoveryQuery;
    cursor?: string;
    tz: string;
    viewerUserId: string | null;
  },
): Promise<{
  host: HostPreview;
  matchingCount: number;
  activeCount: number;
  items: JobCardData[];
  nextCursor: string | null;
} | null> {
  throw new Error('not implemented: locationPreview');
}
