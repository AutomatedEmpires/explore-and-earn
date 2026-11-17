// POST /api/v1/me/invites/{id}/mute. The owner replaces the handler.
import { idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: { method: 'POST', path: '/api/v1/me/invites/{id}/mute', summary: 'Mute an invite host' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
