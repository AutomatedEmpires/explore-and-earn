// GET /api/v1/discovery/locations/{locationId}: the host preview for one map location, with its
// matching jobs in pages of 20 (SP3 spec section 5 and 8.6). 404 when no listing there is active.
import { notFound } from '@/lib/errors';
import { locationPreview, prepareQuery } from '@/modules/discovery';
import { apiRoute } from '@/server/api';
import { getViewer, privateJson } from '@/server/viewer';
import {
  filterParams,
  locationParams,
  privateRoute,
  redactingSearchText,
} from '../../_shared/params';

export const GET = privateRoute(
  apiRoute({
    auth: 'none',
    input: locationParams,
    openapi: {
      method: 'GET',
      path: '/api/v1/discovery/locations/{locationId}',
      summary: "A map location's host and its matching jobs",
    },
    handler: async ({ db, req, input }) =>
      redactingSearchText(req, async () => {
        const viewer = await getViewer(req);
        const { query } = await prepareQuery(db, filterParams(req));
        const preview = await locationPreview(db, {
          locationId: input.locationId,
          query,
          cursor: input.cursor,
          tz: viewer.tz,
          viewerUserId: viewer.seekerId,
        });
        if (!preview) throw notFound('There are no open jobs at this location.');
        return privateJson(preview);
      }),
  }),
);
