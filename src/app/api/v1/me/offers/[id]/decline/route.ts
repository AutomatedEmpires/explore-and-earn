// POST /api/v1/me/offers/{id}/decline.
import { unauthorized } from '@/lib/errors';
import { idParamSchema } from '@/lib/hiring';
import { declineOffer } from '@/modules/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: { method: 'POST', path: '/api/v1/me/offers/{id}/decline', summary: 'Decline an offer' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const offer = await declineOffer(db, user.id, input.id);
    return { offer };
  },
});
