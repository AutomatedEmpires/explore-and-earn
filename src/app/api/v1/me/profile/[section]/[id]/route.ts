// PATCH · DELETE /api/v1/me/profile/{section}/{id} (SP4 spec 5). The apiRoute options below are the contract.
import { unauthorized } from '@/lib/errors';
import { deleteEntry, entryParamsSchema, entryUpdateSchema, updateEntry } from '@/modules/profiles';
import { apiRoute } from '@/server/api';

export const PATCH = apiRoute({
  auth: 'seeker',
  input: entryUpdateSchema,
  openapi: {
    method: 'PATCH',
    path: '/api/v1/me/profile/{section}/{id}',
    summary: 'Update a profile entry',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return updateEntry(db, user.id, input.section, input.id, input);
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
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await deleteEntry(db, user.id, input.section, input.id);
  },
});
