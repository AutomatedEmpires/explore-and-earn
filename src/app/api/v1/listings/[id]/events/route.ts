// POST /api/v1/listings/[id]/events { type: 'view' | 'share', source }: the client records a
// view when the detail page or panel opens, and a share (SP3 spec 5 and 8.12). Always 204:
// bots, repeats within 30 minutes and unknown listings are dropped silently. A source outside
// the known list is attributed to 'other'. The viewer is the user id, or for a guest a keyed
// hash of address and browser; only its HMAC is stored, and only for 24 hours.
import { z } from 'zod';
import { DISCOVERY_SOURCES, isBot } from '@/lib/discovery';
import { dedupeKeyFor, recordListingEvent } from '@/modules/discovery';
import { apiRoute } from '@/server/api';
import { getViewer } from '@/server/viewer';

const input = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['view', 'share']),
  source: z.enum(DISCOVERY_SOURCES).catch('other'),
});

export const POST = apiRoute({
  auth: 'none',
  input,
  openapi: {
    method: 'POST',
    path: '/api/v1/listings/{id}/events',
    summary: 'Record a view or share of a listing',
  },
  handler: async ({ db, input, req }) => {
    if (!isBot(req.headers.get('user-agent'))) {
      const { viewerKey } = await getViewer(req);
      const at = new Date();
      await recordListingEvent(db, {
        listingId: input.id,
        type: input.type,
        source: input.source,
        at,
        viewerKey,
        dedupeKey: dedupeKeyFor(input.type, viewerKey, input.id, at),
      });
    }
    return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } });
  },
});
