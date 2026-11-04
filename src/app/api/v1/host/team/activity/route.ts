// GET /api/v1/host/team/activity?before=<id>: the team activity log, newest first, 50 at a time
// (Owner or Admin). Pass `nextBefore` back as `before` for the next page.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { listActivity, requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

const output = z.object({
  items: z.array(
    z.object({
      at: z.iso.datetime(),
      actorLabel: z.string(),
      action: z.string(),
      summary: z.string(),
    }),
  ),
  nextBefore: z.uuid().nullable(),
});

export const GET = apiRoute({
  auth: 'host',
  input: z.object({ before: z.uuid().optional() }),
  openapi: {
    method: 'GET',
    path: '/api/v1/host/team/activity',
    summary: 'The team activity log',
    output,
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'activity.read');
    const page = await listActivity(db, host, input.before);
    return {
      items: page.items.map((i) => ({ ...i, at: i.at.toISOString() })),
      nextBefore: page.nextBefore,
    };
  },
});
