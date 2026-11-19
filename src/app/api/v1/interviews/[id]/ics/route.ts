// GET /api/v1/interviews/{id}/ics.
import { unauthorized } from '@/lib/errors';
import { idParamSchema } from '@/lib/hiring';
import { getInterviewIcs } from '@/modules/hiring';
import type { ThreadViewer } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import { requireHost } from '@/server/guards';

export const GET = apiRoute({
  auth: 'user',
  input: idParamSchema,
  openapi: { method: 'GET', path: '/api/v1/interviews/{id}/ics', summary: 'Interview calendar file' },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const viewer: ThreadViewer =
      user.accountType === 'host' ? { kind: 'host', ctx: await requireHost() } : { kind: 'seeker', userId: user.id };
    const file = await getInterviewIcs(db, viewer, input.id);
    return new Response(file.content, {
      status: 200,
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'attachment; filename="interview.ics"',
      },
    });
  },
});
