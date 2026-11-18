// GET /api/v1/offers/{id}/letter.
import { unauthorized } from '@/lib/errors';
import { idParamSchema } from '@/lib/hiring';
import { getOfferLetterUrl } from '@/modules/hiring';
import type { ThreadViewer } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import { requireHost } from '@/server/guards';

export const GET = apiRoute({
  auth: 'user',
  input: idParamSchema,
  openapi: { method: 'GET', path: '/api/v1/offers/{id}/letter', summary: 'Offer letter' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const viewer: ThreadViewer =
      user.accountType === 'host' ? { kind: 'host', ctx: await requireHost() } : { kind: 'seeker', userId: user.id };
    const location = await getOfferLetterUrl(db, viewer, input.id);
    return new Response(null, { status: 302, headers: { location } });
  },
});
