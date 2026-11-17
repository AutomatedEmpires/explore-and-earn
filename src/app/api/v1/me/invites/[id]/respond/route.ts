// POST /api/v1/me/invites/{id}/respond. The owner replaces the handler.
import { idParamSchema, inviteResponseSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: inviteResponseSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/me/invites/{id}/respond', summary: 'Respond to an invite' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
