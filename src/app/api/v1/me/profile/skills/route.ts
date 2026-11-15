// PUT /api/v1/me/profile/skills (SP4 spec 5). W0 contract stub: W1 implements the handler
// (Task 9). The apiRoute options below are the contract; keep them.
import { skillsSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'seeker',
  input: skillsSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/profile/skills',
    summary: 'Replace your skills, in rank order',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
