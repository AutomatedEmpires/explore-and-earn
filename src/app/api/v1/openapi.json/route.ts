// Serves the OpenAPI 3.1 document for /api/v1.
//
// Shared touchpoint: every route file that passes `openapi` to apiRoute is imported below, so
// it registers itself before the document is built. src/server/openapi.test.ts fails when a
// documented route is missing from this list. Keep it sorted.
import '@/app/api/v1/health/route';
import '@/app/api/v1/host/locations/[id]/route';
import '@/app/api/v1/host/locations/geocode/route';
import '@/app/api/v1/host/locations/route';
import '@/app/api/v1/me/stream/route';
import '@/app/api/v1/media/[id]/url/route';
import '@/app/api/v1/media/uploads/[id]/complete/route';
import '@/app/api/v1/media/uploads/route';
import '@/app/api/v1/notifications/read/route';
import '@/app/api/v1/notifications/route';
import '@/app/api/v1/onboarding/route';
import '@/app/api/v1/push/subscriptions/route';

import { apiRoute } from '@/server/api';
import { buildOpenApi } from '@/server/openapi';

export const GET = apiRoute({
  auth: 'none',
  handler: async () => {
    const res = Response.json(buildOpenApi());
    res.headers.set('cache-control', 'public, max-age=300');
    return res;
  },
});
