// POST /api/v1/me/availability/confirm (SP4 spec 5). The apiRoute options below are the contract.
import { unauthorized } from '@/lib/errors';
import { confirmAvailability, confirmAvailabilitySchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: confirmAvailabilitySchema,
  openapi: {
    method: 'POST',
    path: '/api/v1/me/availability/confirm',
    summary: 'Confirm the date you can start',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return confirmAvailability(db, user.id, input);
  },
});