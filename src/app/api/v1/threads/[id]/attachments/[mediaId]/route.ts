// GET /api/v1/threads/{id}/attachments/{mediaId}. 302 to a short-lived signed URL.
import { unauthorized } from '@/lib/errors';
import { attachmentParamSchema, attachmentQuerySchema } from '@/lib/messaging';
import { getAttachmentUrl } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import { threadViewer } from '@/server/thread-viewer';

export const GET = apiRoute({
  auth: 'user',
  input: attachmentQuerySchema.safeExtend(attachmentParamSchema.shape),
  openapi: {
    method: 'GET',
    path: '/api/v1/threads/{id}/attachments/{mediaId}',
    summary: 'Attachment URL',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const url = await getAttachmentUrl(
      db,
      await threadViewer(user),
      input.id,
      input.mediaId,
      input.variant,
    );
    return new Response(null, { status: 302, headers: { location: url } });
  },
});
