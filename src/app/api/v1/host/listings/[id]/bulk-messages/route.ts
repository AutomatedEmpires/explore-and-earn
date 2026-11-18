// POST /api/v1/host/listings/{id}/bulk-messages.
import { notFound, unauthorized } from '@/lib/errors';
import { bulkMessageSchema, idParamSchema } from '@/lib/messaging';
import { listApplicationIdsByStatus } from '@/modules/hiring';
import { getHiringInfoMany } from '@/modules/listings';
import { createBulkMessage } from '@/modules/messaging';
import { canAccessListing } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: bulkMessageSchema.safeExtend(idParamSchema.shape),
  rateLimit: { key: (ctx) => `bulk:${ctx.host?.orgId}`, limit: 5, windowSec: 3600 },
  openapi: {
    method: 'POST',
    path: '/api/v1/host/listings/{id}/bulk-messages',
    summary: 'Send a bulk message',
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    const [info] = await getHiringInfoMany(db, [input.id]);
    if (!info) throw notFound();
    const allowed = await canAccessListing(db, host, {
      id: info.id,
      locationId: info.locationId,
    });
    if (!allowed) throw notFound();
    const applicationIds = await listApplicationIdsByStatus(db, {
      orgId: host.orgId,
      listingId: input.id,
      statuses: input.statuses,
    });
    return createBulkMessage(db, host, {
      listingId: input.id,
      statuses: input.statuses,
      body: input.body,
      applicationIds,
    });
  },
});
