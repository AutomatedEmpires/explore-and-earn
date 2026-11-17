// PATCH/DELETE /api/v1/host/saved-replies/{id}. The owner replaces the handler.
import { idParamSchema, savedReplyPatchSchema } from '@/lib/messaging';
import { apiRoute } from '@/server/api';

export const PATCH = apiRoute({
  auth: 'host',
  input: savedReplyPatchSchema.safeExtend(idParamSchema.shape),
  openapi: { method: 'PATCH', path: '/api/v1/host/saved-replies/{id}', summary: 'Update a saved reply' },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const DELETE = apiRoute({
  auth: 'host',
  input: idParamSchema,
  openapi: { method: 'DELETE', path: '/api/v1/host/saved-replies/{id}', summary: 'Delete a saved reply' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
