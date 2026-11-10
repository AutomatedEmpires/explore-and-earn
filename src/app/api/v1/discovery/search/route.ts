// GET /api/v1/discovery/search: Seek, and the Map pull-up list with `surface=map_list` and a
// bbox (SP3 spec section 5 and Plan decision 5). The filter params are read by prepareQuery;
// the search text never reaches the logs or analytics (spec 10).
// @/server/api first: it loads identity before orgs (see _shared/params.ts).
import { apiRoute } from '@/server/api';
import { track } from '@/lib/analytics';
import { describeFilters } from '@/lib/discovery';
import { prepareQuery, searchListings } from '@/modules/discovery';
import { getViewer, privateJson } from '@/server/viewer';
import {
  filterParams,
  originOf,
  privateRoute,
  redactingSearchText,
  searchParams,
} from '../_shared/params';

export const GET = privateRoute(
  apiRoute({
    auth: 'none',
    input: searchParams,
    openapi: {
      method: 'GET',
      path: '/api/v1/discovery/search',
      summary: 'Search open jobs (Seek, and the Map list with a bbox)',
    },
    handler: async ({ db, req, input }) =>
      redactingSearchText(req, async () => {
        const viewer = await getViewer(req);
        const { query, sort, labels } = await prepareQuery(db, filterParams(req));
        const surface = input.surface ?? 'seek';
        const result = await searchListings(db, {
          query: input.bbox ? { ...query, bbox: input.bbox } : query,
          sort,
          surface,
          cursor: input.cursor,
          limit: input.limit,
          origin: originOf(input),
          tz: viewer.tz,
          viewerUserId: viewer.seekerId,
          viewerKey: viewer.viewerKey,
        });
        track('discovery_search', {
          surface,
          sort,
          filterCount: describeFilters(query, labels).filter((c) => c.key !== 'q').length,
          hasQuery: Boolean(query.q),
        });
        return privateJson(result);
      }),
  }),
);
