// GET /api/v1/listings/{id}: the public listing detail (SP3 spec section 5 and 8.9). An active
// listing is read from SP2 on every request; a closed one is `{ status: 'closed', card }`; a
// removed or unknown one is a 404.
import { notFound } from '@/lib/errors';
import { getListingDetail } from '@/modules/discovery';
import { apiRoute } from '@/server/api';
import { getViewer, privateJson } from '@/server/viewer';
import { listingParams, privateRoute } from '../../discovery/_shared/params';

export const GET = privateRoute(
  apiRoute({
    auth: 'none',
    input: listingParams,
    openapi: {
      method: 'GET',
      path: '/api/v1/listings/{id}',
      summary: 'A public listing: the full detail, or the closed card',
    },
    handler: async ({ db, req, input }) => {
      const viewer = await getViewer(req);
      const detail = await getListingDetail(db, {
        listingId: input.id,
        viewerUserId: viewer.seekerId,
        tz: viewer.tz,
      });
      if (!detail) throw notFound('This job is no longer listed.');
      return privateJson(detail);
    },
  }),
);
