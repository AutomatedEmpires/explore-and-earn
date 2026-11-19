// GET · PUT /api/v1/me/blocks (SP4 spec 5 and 8.7).
//
// PUT blocks a host (`org`) or a person (`user`) for the signed-in seeker, and with
// `withdrawApplications` also withdraws their open applications to that host, in one
// transaction: if withdrawing fails, nothing is blocked. 204.
// GET lists the hosts and people the seeker blocked, newest first. It never shows a block
// someone else made: a seeker never learns that a host blocked them.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { withTx } from '@/lib/db';
import { unauthorized } from '@/lib/errors';
import { withdrawOpenForOrg } from '@/modules/applications';
import { kickWorker } from '@/modules/jobs';
import { getCommunityIdentities } from '@/modules/profiles';
import { block, blockSchema, listBlocks, type Party } from '@/modules/safety';
import { privateJson } from '@/server/viewer';
import { hostNames } from './_shared/host-names';

/** A person without a profile name (rare: SP7 shows only named members). */
const UNNAMED_PERSON = 'Explore&Earn member';

export const GET = apiRoute({
  auth: 'seeker',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/blocks',
    summary: 'List the hosts and people you blocked',
  },
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    const rows = await listBlocks(db, { type: 'user', id: user.id });
    const orgRows = rows.filter((r) => r.target.type === 'org');
    const userRows = rows.filter((r) => r.target.type === 'user');
    const [hosts, people] = await Promise.all([
      hostNames(
        db,
        orgRows.map((r) => r.target.id),
      ),
      getCommunityIdentities(
        db,
        userRows.map((r) => r.target.id),
      ),
    ]);
    return privateJson({
      orgs: orgRows.map((r) => ({
        orgId: r.target.id,
        name: hosts.get(r.target.id)?.name ?? '',
        logoMediaId: hosts.get(r.target.id)?.logoMediaId ?? null,
        blockedAt: r.createdAt.toISOString(),
      })),
      users: userRows.map((r) => ({
        userId: r.target.id,
        displayName: people.get(r.target.id)?.displayName ?? UNNAMED_PERSON,
        blockedAt: r.createdAt.toISOString(),
      })),
    });
  },
});

export const PUT = apiRoute({
  auth: 'seeker',
  input: blockSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/blocks',
    summary: 'Block a host or a person',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const target: Party = { type: input.targetType, id: input.targetId };
    const withdrawn = await withTx(db, async (tx) => {
      await block(tx, { type: 'user', id: user.id }, target, user.id);
      if (!input.withdrawApplications || target.type !== 'org') return 0;
      return withdrawOpenForOrg(tx, { seekerUserId: user.id, orgId: target.id });
    });
    // Withdrawing queued the application.withdrawn events.
    if (withdrawn > 0) kickWorker();
    return undefined;
  },
});
