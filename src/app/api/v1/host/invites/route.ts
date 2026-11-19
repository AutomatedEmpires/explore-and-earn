// /api/v1/host/invites (SP5 spec 5 and 8.4, plan Tasks 14 and 15).
// GET: the org's invites on listings in scope, newest first -> Page<HostInviteItem>.
// POST: invite a pool candidate for one credit -> 201 { invite }; 409 `seeker_unavailable`,
// `no_credits`, `already_invited`, `listing_inactive`. 100 an hour per org.
import { unauthorized } from '@/lib/errors';
import { hostInvitesQuerySchema, RATE_LIMITS, sendInviteSchema } from '@/lib/hiring';
import { listHostInvites, sendInvite } from '@/modules/hiring';
import { kickWorker } from '@/modules/jobs';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import { privateJson } from '@/server/viewer';

export const GET = apiRoute({
  auth: 'host',
  input: hostInvitesQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/invites', summary: 'List invites' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'invites.send');
    return privateJson(await listHostInvites(db, host, input));
  },
});

export const POST = apiRoute({
  auth: 'host',
  input: sendInviteSchema,
  rateLimit: {
    key: (ctx) => `invites:${ctx.host?.orgId}`,
    limit: RATE_LIMITS.invites.limit,
    windowSec: RATE_LIMITS.invites.windowSec,
  },
  openapi: { method: 'POST', path: '/api/v1/host/invites', summary: 'Send an invite' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'invites.send');
    const result = await sendInvite(db, host, input);
    kickWorker();
    return privateJson(result, { status: 201 });
  },
});
