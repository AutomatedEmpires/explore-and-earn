// GET /api/v1/me/invites/{id}. The owner replaces the handler.
import { idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: { method: 'GET', path: '/api/v1/me/invites/{id}', summary: 'Invite detail' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
