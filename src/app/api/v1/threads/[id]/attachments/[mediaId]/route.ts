// GET /api/v1/threads/{id}/attachments/{mediaId}. The owner replaces the handler.
import { attachmentParamSchema, attachmentQuerySchema } from '@/lib/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'user',
  input: attachmentQuerySchema.safeExtend(attachmentParamSchema.shape),
  openapi: { method: 'GET', path: '/api/v1/threads/{id}/attachments/{mediaId}', summary: 'Attachment URL' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
