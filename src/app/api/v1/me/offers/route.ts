// GET /api/v1/me/offers.
import { unauthorized } from '@/lib/errors';
import { cursorQuerySchema } from '@/lib/hiring';
import { listSeekerOffers } from '@/modules/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: cursorQuerySchema,
  openapi: { method: 'GET', path: '/api/v1/me/offers', summary: 'List my offers' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return listSeekerOffers(db, user.id, input);
  },
});
