// DELETE /api/v1/me/ai-consent (SP4 spec 5). W0 contract stub: W3 implements the handler
// (Task 15). The apiRoute options below are the contract; keep them.
import { apiRoute } from '@/server/api';

export const DELETE = apiRoute({
  auth: 'seeker',
  openapi: {
    method: 'DELETE',
    path: '/api/v1/me/ai-consent',
    summary: 'Revoke your AI import consent',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
