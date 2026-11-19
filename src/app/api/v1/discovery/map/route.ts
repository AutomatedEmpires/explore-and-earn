// GET /api/v1/discovery/map: pins in the viewport, or grid clusters above 2,000 locations (SP3
// spec section 5 and 8.6). The bbox may cross the antimeridian (west > east, Review Focus 5).
// @/server/api first: it loads identity before orgs (see _shared/params.ts).
import { apiRoute } from '@/server/api';
import { mapPins, prepareQuery } from '@/modules/discovery';
import { getViewer, privateJson } from '@/server/viewer';
import { filterParams, mapParams, privateRoute, redactingSearchText } from '../_shared/params';

export const GET = privateRoute(
  apiRoute({
    auth: 'none',
    input: mapParams,
    openapi: {
      method: 'GET',
      path: '/api/v1/discovery/map',
      summary: 'Map pins (or clusters) for the open jobs in a bbox',
    },
    handler: async ({ db, req, input }) =>
      redactingSearchText(req, async () => {
        const viewer = await getViewer(req);
        const { query } = await prepareQuery(db, filterParams(req));
        const result = await mapPins(db, {
          query,
          bbox: input.bbox,
          zoom: input.zoom,
          viewerUserId: viewer.seekerId,
          tz: viewer.tz,
        });
        return privateJson(result);
      }),
  }),
);
