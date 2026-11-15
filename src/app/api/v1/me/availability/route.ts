// PUT /api/v1/me/availability (SP4 spec 5). W0 contract stub: W1 implements the handler
// (Task 10). The apiRoute options below are the contract; keep them.
import { availabilityInputSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'seeker',
  input: availabilityInputSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/availability',
    summary: 'Set the date you can start',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
