// GET /api/v1/host/applications/{id} (SP4 spec 5): one application as the host received it.
//
// host* (SP4 plan): the role must be owner, admin or recruiter (403, reason
// role_not_allowed), the application must be the host's own org's and canAccessListing must
// pass (404 otherwise, the same as an unknown id). Billing members get 403. Every read is
// audited (`applications.snapshot_viewed`). A host whose verification is running,
// needs_review, needs_info or failed gets 409 `verification_<status>` before anything is read
// or audited (legal review 7.1).
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { forbidden } from '@/lib/errors';
import { getHostApplication, idParamSchema } from '@/modules/applications';
import { privateJson } from '@/server/viewer';
import { requireVerifiedHost } from '../_shared/verified-host';

export const GET = apiRoute({
  auth: 'host',
  input: idParamSchema,
  openapi: {
    method: 'GET',
    path: '/api/v1/host/applications/{id}',
    summary: 'Read an application',
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw forbidden();
    await requireVerifiedHost(db, host.orgId);
    return privateJson(await getHostApplication(db, host, input.id));
  },
});
