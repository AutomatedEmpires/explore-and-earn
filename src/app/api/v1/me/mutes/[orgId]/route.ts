// PUT · DELETE /api/v1/me/mutes/{orgId} (SP4 spec 5). W0 contract stub: W5 implements the handler
// (Task 26). The apiRoute options below are the contract; keep them.
import { orgIdParamSchema } from '@/modules/safety';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'seeker',
  input: orgIdParamSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/mutes/{orgId}',
    summary: 'Mute a host',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const DELETE = apiRoute({
  auth: 'seeker',
  input: orgIdParamSchema,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/me/mutes/{orgId}',
    summary: 'Unmute a host',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
