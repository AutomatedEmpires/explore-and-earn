// GET /api/v1/me/mutes (SP4 spec 5). W0 contract stub: W5 implements the handler
// (Task 26). The apiRoute options below are the contract; keep them.
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/mutes',
    summary: 'List the hosts you muted',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
