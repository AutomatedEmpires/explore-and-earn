// POST /api/v1/me/interviews/{id}/pick.
import { unauthorized } from '@/lib/errors';
import { idParamSchema, pickSlotSchema } from '@/lib/hiring';
import { pickSlot } from '@/modules/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: pickSlotSchema.safeExtend(idParamSchema.shape),
  rateLimit: { key: (ctx) => `interviews:${ctx.user?.id}`, limit: 30, windowSec: 3600 },
  openapi: { method: 'POST', path: '/api/v1/me/interviews/{id}/pick', summary: 'Pick an interview slot' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const interview = await pickSlot(db, user.id, input.id, { slotId: input.slotId, round: input.round });
    return { interview };
  },
});
