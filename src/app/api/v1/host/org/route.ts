// PATCH /api/v1/host/org: organization settings (Owner or Admin). The primary location must be
// one of the org's live locations. A new name or website re-runs business verification in the
// background; live listings stay up.
import { notFound, unauthorized } from '@/lib/errors';
import { clerkAdmin } from '@/modules/identity';
import { kickWorker } from '@/modules/jobs';
import { getLocations } from '@/modules/locations';
import {
  getOrgSummaries,
  orgJson,
  orgJsonSchema,
  requireCapability,
  updateOrg,
  updateOrgSchema,
} from '@/modules/orgs';
import { requestReverification } from '@/modules/verification';
import { apiRoute } from '@/server/api';

export const PATCH = apiRoute({
  auth: 'host',
  input: updateOrgSchema,
  openapi: {
    method: 'PATCH',
    path: '/api/v1/host/org',
    summary: 'Update the organization name, website, Recruiter approval or primary location',
    output: orgJsonSchema,
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'team.manage');

    if (input.primaryLocationId) {
      const location = (await getLocations(db, [input.primaryLocationId])).get(
        input.primaryLocationId,
      );
      if (!location || location.orgId !== host.orgId || location.archived) {
        throw notFound('Location not found');
      }
    }

    const before = (await getOrgSummaries(db, [host.orgId])).get(host.orgId);
    const org = await updateOrg(db, clerkAdmin(), host, input);
    if (before && (before.name !== org.name || before.websiteUrl !== org.websiteUrl)) {
      await requestReverification(db, host.orgId);
      kickWorker();
    }
    return orgJson(org);
  },
});
