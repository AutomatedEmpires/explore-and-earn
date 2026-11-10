// GET /api/v1/discovery/deck: the Swipe deck (SP3 spec section 5 and 8.5). The same search as
// Seek, without the viewer's saved, skipped and applied listings, in batches of up to 20.
// @/server/api first: it loads identity before orgs (see _shared/params.ts).
import { apiRoute } from '@/server/api';
import { prepareQuery, searchListings } from '@/modules/discovery';
import { getViewer, privateJson } from '@/server/viewer';
import {
  deckParams,
  filterParams,
  originOf,
  privateRoute,
  redactingSearchText,
} from '../_shared/params';

export const GET = privateRoute(
  apiRoute({
    auth: 'none',
    input: deckParams,
    openapi: {
      method: 'GET',
      path: '/api/v1/discovery/deck',
      summary: 'The next cards of the Swipe deck',
    },
    handler: async ({ db, req, input }) =>
      redactingSearchText(req, async () => {
        const viewer = await getViewer(req);
        const { query, sort } = await prepareQuery(db, filterParams(req));
        const { items, nextCursor } = await searchListings(db, {
          query,
          sort,
          surface: 'swipe',
          cursor: input.cursor,
          limit: input.limit,
          origin: originOf(input),
          tz: viewer.tz,
          viewerUserId: viewer.seekerId,
          viewerKey: viewer.viewerKey,
        });
        return privateJson({ items, nextCursor });
      }),
  }),
);
