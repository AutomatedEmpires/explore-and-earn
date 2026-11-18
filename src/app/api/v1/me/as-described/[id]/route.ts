// GET/POST /api/v1/me/as-described/{id}.
import { asDescribedSubmitSchema, idParamSchema } from '@/lib/hiring';
import { unauthorized } from '@/lib/errors';
import { getAsDescribedPrompt, submitAsDescribed } from '@/modules/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: { method: 'GET', path: '/api/v1/me/as-described/{id}', summary: 'As-described prompt' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return getAsDescribedPrompt(db, user.id, input.id);
  },
});

export const POST = apiRoute({
  auth: 'seeker',
  input: asDescribedSubmitSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/me/as-described/{id}', summary: 'Submit as-described' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const { id, ...answers } = input;
    return submitAsDescribed(db, user.id, id, answers);
  },
});
