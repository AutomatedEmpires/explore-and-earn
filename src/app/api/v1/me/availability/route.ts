// PUT /api/v1/me/availability (SP4 spec 5). The apiRoute options below are the contract.
import { unauthorized } from '@/lib/errors';
import { availabilityInputSchema, setAvailability } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const PUT = apiRoute({
  auth: 'seeker',
  input: availabilityInputSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/availability',
    summary: 'Set the date you can start',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return setAvailability(db, user.id, input);
  },
});
