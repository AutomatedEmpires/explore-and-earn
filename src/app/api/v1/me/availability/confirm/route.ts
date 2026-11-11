// POST /api/v1/me/availability/confirm (SP4 spec 5). W0 contract stub: W1 implements the handler
// (Task 10). The apiRoute options below are the contract; keep them.
import { confirmAvailabilitySchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: confirmAvailabilitySchema,
  openapi: {
    method: 'POST',
    path: '/api/v1/me/availability/confirm',
    summary: 'Confirm the date you can start',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
