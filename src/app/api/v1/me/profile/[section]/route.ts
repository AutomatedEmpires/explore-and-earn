// POST /api/v1/me/profile/{section} (SP4 spec 5). W0 contract stub: W1 implements the handler
// (Task 9). The apiRoute options below are the contract; keep them.
import { entryCreateSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: entryCreateSchema,
  openapi: {
    method: 'POST',
    path: '/api/v1/me/profile/{section}',
    summary: 'Add an experience, education or certification entry',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
