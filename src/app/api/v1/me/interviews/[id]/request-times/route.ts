// POST /api/v1/me/interviews/{id}/request-times.
import { unauthorized } from '@/lib/errors';
import { idParamSchema, requestTimesSchema } from '@/lib/hiring';
import { requestNewTimes } from '@/modules/hiring';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'seeker',
  input: requestTimesSchema.safeExtend(idParamSchema.shape),
  rateLimit: { key: (ctx) => `interviews:${ctx.user?.id}`, limit: 30, windowSec: 3600 },
  openapi: { method: 'POST', path: '/api/v1/me/interviews/{id}/request-times', summary: 'Request new interview times' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const { id, ...times } = input;
    const interview = await requestNewTimes(db, user.id, id, times);
    return { interview };
  },
});
