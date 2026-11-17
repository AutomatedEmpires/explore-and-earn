// GET · PUT /api/v1/me/blocks (SP4 spec 5). W0 contract stub: W5 implements the handler
// (Task 26). The apiRoute options below are the contract; keep them.
import { blockSchema } from '@/modules/safety';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/blocks',
    summary: 'List the hosts and people you blocked',
  },
  handler: async () => {
    throw new Error('not implemented');
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
  handler: async () => {
    throw new Error('not implemented');
  },
});
