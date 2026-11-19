// GET · PUT /api/v1/host/blocks (SP4 spec 5, 8.7 and 10).
//
// PUT is host*: the application id goes through authorizeHostApplication (the role must be
// owner, admin or recruiter, otherwise 403 `role_not_allowed`; another org's application, one
// outside the member's listings or one whose seeker blocked the org is 404), then the org
// blocks the seeker. Billing members get 403. 204, also for a repeat.
// GET is owner or admin only (403 `role_not_allowed`): the applicants the org blocked, by first
// name and last initial, newest first. It never carries a seeker user id (hosts address
// applicants by application id only), and never lists a seeker who blocked the org.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { withTx } from '@/lib/db';
import { forbidden } from '@/lib/errors';
import { authorizeHostApplication } from '@/modules/applications';
import { getCommunityIdentities } from '@/modules/profiles';
import { block, hostBlockSchema, listBlocks } from '@/modules/safety';
import { privateJson } from '@/server/viewer';
import { requireBlockAdmin } from './_shared/roles';

/** An applicant whose profile has no name any more. */
const UNNAMED_APPLICANT = 'Applicant';

export const GET = apiRoute({
  auth: 'host',
  openapi: {
    method: 'GET',
    path: '/api/v1/host/blocks',
    summary: 'List the applicants your organization blocked',
  },
  handler: async ({ db, host }) => {
    if (!host) throw forbidden();
    requireBlockAdmin(host);
    const rows = (await listBlocks(db, { type: 'org', id: host.orgId })).filter(
      (r) => r.target.type === 'user',
    );
    const people = await getCommunityIdentities(
      db,
      rows.map((r) => r.target.id),
    );
    return privateJson({
      items: rows.map((r) => {
        const person = people.get(r.target.id);
        return {
          blockId: r.blockId,
          firstName: person?.firstName ?? UNNAMED_APPLICANT,
          lastInitial: person?.lastInitial ?? '',
          blockedAt: r.createdAt.toISOString(),
        };
      }),
    });
  },
});

export const PUT = apiRoute({
  auth: 'host',
  input: hostBlockSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/host/blocks',
    summary: 'Block an applicant',
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw forbidden();
    await withTx(db, async (tx) => {
      const ref = await authorizeHostApplication(tx, host, input.applicationId);
      await block(tx, { type: 'org', id: host.orgId }, { type: 'user', id: ref.seekerUserId }, host.user.id);
    });
    return undefined;
  },
});
