// GET/POST /api/v1/me/as-described/{id}. The owner replaces the handler.
import { asDescribedSubmitSchema, idParamSchema } from '@/lib/hiring';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  input: idParamSchema,
  openapi: { method: 'GET', path: '/api/v1/me/as-described/{id}', summary: 'As-described prompt' },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const POST = apiRoute({
  auth: 'seeker',
  input: asDescribedSubmitSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'POST', path: '/api/v1/me/as-described/{id}', summary: 'Submit as-described' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
