// Serves the OpenAPI 3.1 document for /api/v1.
//
// Shared touchpoint: every route file that passes `openapi` to apiRoute is imported below, so
// it registers itself before the document is built. src/server/openapi.test.ts fails when a
// documented route is missing from this list. Keep it sorted.
import '@/app/api/v1/applications/route';
import '@/app/api/v1/apply/[listingId]/context/route';
import '@/app/api/v1/discovery/deck/route';
import '@/app/api/v1/discovery/locations/[locationId]/route';
import '@/app/api/v1/discovery/map/route';
import '@/app/api/v1/discovery/search/route';
import '@/app/api/v1/discovery/states/route';
import '@/app/api/v1/discovery/suggest/route';
import '@/app/api/v1/health/route';
import '@/app/api/v1/host/applications/[id]/resume.pdf/route';
import '@/app/api/v1/host/applications/[id]/route';
import '@/app/api/v1/host/blocks/[blockId]/route';
import '@/app/api/v1/host/blocks/route';
import '@/app/api/v1/host/locations/[id]/route';
import '@/app/api/v1/host/locations/geocode/route';
import '@/app/api/v1/host/locations/route';
import '@/app/api/v1/host/org/route';
import '@/app/api/v1/host/page/slug/route';
import '@/app/api/v1/host/team/activity/route';
import '@/app/api/v1/host/team/invitations/[id]/route';
import '@/app/api/v1/host/team/invitations/route';
import '@/app/api/v1/host/team/members/[id]/route';
import '@/app/api/v1/host/team/route';
import '@/app/api/v1/host/team/transfer-ownership/route';
import '@/app/api/v1/host/verification/info/route';
import '@/app/api/v1/host/verification/route';
import '@/app/api/v1/landing/route';
import '@/app/api/v1/listings/[id]/events/route';
import '@/app/api/v1/listings/[id]/route';
import '@/app/api/v1/me/ai-consent/route';
import '@/app/api/v1/me/alert-settings/route';
import '@/app/api/v1/me/applications/[id]/additional-step/route';
import '@/app/api/v1/me/applications/[id]/resume.pdf/route';
import '@/app/api/v1/me/applications/[id]/route';
import '@/app/api/v1/me/applications/[id]/withdraw/route';
import '@/app/api/v1/me/applications/route';
import '@/app/api/v1/me/availability/confirm/route';
import '@/app/api/v1/me/availability/route';
import '@/app/api/v1/me/blocks/[type]/[id]/route';
import '@/app/api/v1/me/blocks/route';
import '@/app/api/v1/me/dispositions/[listingId]/route';
import '@/app/api/v1/me/dispositions/route';
import '@/app/api/v1/me/mutes/[orgId]/route';
import '@/app/api/v1/me/mutes/route';
import '@/app/api/v1/me/notification-preferences/route';
import '@/app/api/v1/me/profile/[section]/[id]/route';
import '@/app/api/v1/me/profile/[section]/order/route';
import '@/app/api/v1/me/profile/[section]/route';
import '@/app/api/v1/me/profile/route';
import '@/app/api/v1/me/profile/skills/route';
import '@/app/api/v1/me/resume-imports/[id]/merge/route';
import '@/app/api/v1/me/resume-imports/[id]/route';
import '@/app/api/v1/me/resume-imports/route';
import '@/app/api/v1/me/resume.pdf/route';
import '@/app/api/v1/me/saved-searches/[id]/route';
import '@/app/api/v1/me/saved-searches/route';
import '@/app/api/v1/me/stream/route';
import '@/app/api/v1/me/writing-help/route';
import '@/app/api/v1/media/[id]/url/route';
import '@/app/api/v1/media/uploads/[id]/complete/route';
import '@/app/api/v1/media/uploads/route';
import '@/app/api/v1/notifications/read/route';
import '@/app/api/v1/notifications/route';
import '@/app/api/v1/onboarding/route';
import '@/app/api/v1/push/subscriptions/route';
import '@/app/api/v1/reports/route';
import '@/app/api/v1/team/invitations/[token]/route';
import '@/app/api/v1/team/invitations/accept/route';

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
