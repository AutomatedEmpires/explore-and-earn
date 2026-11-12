// POST /api/v1/listings/[id]/events { type: 'view' | 'share', source }: the client records a
// view when the detail page or panel opens, and a share (SP3 spec 5 and 8.12). Bots, repeats
// within 30 minutes and unknown listings are dropped silently. A source outside the known list
// is attributed to 'other'. `boost` is taken from the placement hook, never from the client.
// The viewer is the user id, or for a guest an HMAC of the IP; only that HMAC is stored, and
// only for 24 hours. An address over the limit gets 429.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { z } from 'zod';
import { DISCOVERY_SOURCES, isBot, type DiscoverySource } from '@/lib/discovery';
import { getEnv } from '@/lib/env';
import { dedupeKeyFor, getPlacementHook, recordListingEvent } from '@/modules/discovery';
import { clientIp, hashIp } from '@/server/request-context';
import { getViewer } from '@/server/viewer';

const input = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['view', 'share']),
  source: z.enum(DISCOVERY_SOURCES).catch('other'),
});

/** Public view and share beacons, per address. */
export const LISTING_EVENT_RATE = { limit: 60, windowSec: 60 } as const;

export const POST = apiRoute({
  auth: 'none',
  input,
  rateLimit: {
    key: (ctx) => {
      const hashed = hashIp(clientIp(ctx.req), getEnv().JOBS_SECRET) ?? 'unknown';
      return `listing-events:${hashed}`;
    },
    limit: LISTING_EVENT_RATE.limit,
    windowSec: LISTING_EVENT_RATE.windowSec,
  },
  openapi: {
    method: 'POST',
    path: '/api/v1/listings/{id}/events',
    summary: 'Record a view or share of a listing',
  },
  handler: async ({ db, input, req }) => {
    if (!isBot(req.headers.get('user-agent'))) {
      const { viewerKey } = await getViewer(req);
      const at = new Date();
      let source: DiscoverySource = input.source;
      if (source === 'boost') {
        const live = await (await getPlacementHook()).boostedAmong(db, [input.id], at);
        source = live.has(input.id) ? 'boost' : 'other';
      }
      await recordListingEvent(db, {
        listingId: input.id,
        type: input.type,
        source,
        at,
        viewerKey,
        dedupeKey: dedupeKeyFor(input.type, viewerKey, input.id, at),
      });
    }
    return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } });
  },
});
