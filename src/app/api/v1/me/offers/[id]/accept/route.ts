// POST /api/v1/me/offers/{id}/accept.
import { unauthorized } from '@/lib/errors';
import { idParamSchema } from '@/lib/hiring';
import { acceptOffer } from '@/modules/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: { method: 'POST', path: '/api/v1/me/offers/{id}/accept', summary: 'Accept an offer' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return acceptOffer(db, user.id, input.id);
  },
});
