// PATCH · DELETE /api/v1/me/profile/{section}/{id} (SP4 spec 5). W0 contract stub: W1 implements the handler
// (Task 9). The apiRoute options below are the contract; keep them.
import { entryParamsSchema, entryUpdateSchema } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const PATCH = apiRoute({
  auth: 'seeker',
  input: entryUpdateSchema,
  openapi: {
    method: 'PATCH',
    path: '/api/v1/me/profile/{section}/{id}',
    summary: 'Update a profile entry',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const DELETE = apiRoute({
  auth: 'seeker',
  input: entryParamsSchema,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/me/profile/{section}/{id}',
    summary: 'Delete a profile entry',
  },
  handler: async () => {
    throw new Error('not implemented');
  },
});
