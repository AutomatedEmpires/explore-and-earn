// GET /api/v1/host/analytics.
import { analyticsQuerySchema } from '@/lib/host-analytics';
import { unauthorized } from '@/lib/errors';
import { getHostAnalytics } from '@/modules/analytics';
import { apiRoute } from '@/server/api';
import { analyticsListingIds } from './scope';

export const GET = apiRoute({
  auth: 'host',
  input: analyticsQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/analytics', summary: 'Host analytics' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    const listingIds = await analyticsListingIds(db, host, input.listingId);
    return getHostAnalytics(db, {
      orgId: host.orgId,
      range: input.range,
      listingIds,
      locationId: input.locationId,
      tz: input.tz,
    });
  },
});
