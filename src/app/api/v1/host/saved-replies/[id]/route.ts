// PATCH/DELETE /api/v1/host/saved-replies/{id}.
import { unauthorized } from '@/lib/errors';
import { idParamSchema, savedReplyPatchSchema } from '@/lib/messaging';
import { deleteSavedReply, updateSavedReply } from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const PATCH = apiRoute({
  auth: 'host',
  input: savedReplyPatchSchema.safeExtend(idParamSchema.shape),
  openapi: {
    method: 'PATCH',
    path: '/api/v1/host/saved-replies/{id}',
    summary: 'Update a saved reply',
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    return updateSavedReply(db, host, input.id, input);
  },
});

export const DELETE = apiRoute({
  auth: 'host',
  input: idParamSchema,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/host/saved-replies/{id}',
    summary: 'Delete a saved reply',
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    await deleteSavedReply(db, host, input.id);
  },
});
