// GET/POST /api/v1/host/invites. The owner replaces the handler.
import { hostInvitesQuerySchema, sendInviteSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: hostInvitesQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/host/invites', summary: 'List invites' },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const POST = apiRoute({
  auth: 'host',
  input: sendInviteSchema,
  rateLimit: { key: (ctx) => `invites:${ctx.host?.orgId}`, limit: 100, windowSec: 3600 },
  openapi: { method: 'POST', path: '/api/v1/host/invites', summary: 'Send an invite' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
