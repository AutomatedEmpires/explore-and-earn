// Loading a listing for /jobs/view/[id] and /jobs/view/[id]/[slug] (SP3 spec 8.9 and 8.11).
// The lookup is cached per request, so the metadata and the page read it once.
import 'server-only';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { DISCOVERY_SOURCES, type DiscoverySource, type JobCardData, type ListingDetail } from '@/lib/discovery';
import { getListingDetail } from '@/modules/discovery';
import { getMediaInfo } from '@/modules/media';
import { signInUrl } from '@/server/shell';
import type { PhotoAlts } from './listing-view';

export type Closed = { status: 'closed'; card: JobCardData };

export const loadListing = cache(
  async (id: string, viewerUserId: string | null, tz: string): Promise<ListingDetail | Closed | null> =>
    getListingDetail(getDb(), { listingId: id, viewerUserId, tz }),
);

export function isClosed(detail: ListingDetail | Closed): detail is Closed {
  return !('content' in detail);
}

/** The slug at the end of a listing's href ("/jobs/view/<id>/<slug>?source=..."). */
export function slugOf(href: string, fallback: string): string {
  return (href.split('?')[0] ?? '').split('/').pop() || fallback;
}

/** `/jobs/view/<id>/<slug>`, the address every link and the canonical tag use. */
export function canonicalPath(detail: ListingDetail | Closed): string {
  const card = isClosed(detail) ? detail.card : detail;
  return `/jobs/view/${card.listingId}/${slugOf(card.href, card.listingId)}`;
}

/** The `source` query value when it is a known one, else `other` (spec 8.12). */
export function sourceOf(v: string | string[] | undefined): DiscoverySource {
  const s = Array.isArray(v) ? v[0] : v;
  return (DISCOVERY_SOURCES as readonly string[]).includes(s ?? '') ? (s as DiscoverySource) : 'other';
}

/** The host's alt text for the listing's housing and meal photos. */
export async function photoAlts(detail: ListingDetail): Promise<PhotoAlts> {
  const ids = Object.keys(detail.photoUrls);
  if (ids.length === 0) return new Map();
  const info = await getMediaInfo(getDb(), ids);
  return new Map([...info].map(([id, m]) => [id, m.altText]));
}

/** Where Apply goes: the apply step for a seeker; sign-in, then the apply step, for a guest. */
export function applyHref(listingId: string, source: DiscoverySource, signedIn: boolean): string {
  const apply = `/apply/${encodeURIComponent(listingId)}?source=${source}`;
  return signedIn ? apply : signInUrl(apply);
}
