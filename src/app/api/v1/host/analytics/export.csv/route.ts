// GET /api/v1/host/analytics/export.csv.
import { analyticsQuerySchema } from '@/lib/host-analytics';
import { unauthorized } from '@/lib/errors';
import { record } from '@/modules/audit';
import { getHostAnalytics, toAnalyticsCsv } from '@/modules/analytics';
import { apiRoute } from '@/server/api';
import { analyticsListingIds } from '../scope';

export const GET = apiRoute({
  auth: 'host',
  input: analyticsQuerySchema,
  rateLimit: { key: (ctx) => `export:${ctx.user?.id}`, limit: 20, windowSec: 3600 },
  openapi: { method: 'GET', path: '/api/v1/host/analytics/export.csv', summary: 'Export host analytics' },
  handler: async ({ db, host, user, input }) => {
    if (!host || !user) throw unauthorized();
    const listingIds = await analyticsListingIds(db, host, input.listingId);
    const analytics = await getHostAnalytics(db, {
      orgId: host.orgId,
      range: input.range,
      listingIds,
      locationId: input.locationId,
      tz: input.tz,
    });
    const body = toAnalyticsCsv(analytics);
    await record(db, {
      actorType: 'user',
      actorId: user.id,
      orgId: host.orgId,
      action: 'analytics.exported',
      subjectType: 'organization',
      subjectId: host.orgId,
      data: { range: input.range },
    });
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="analytics-${input.range}.csv"`,
      },
    });
  },
});
