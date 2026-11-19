// GET /api/v1/me/dispositions: the signed-in seeker's saved or skipped jobs, newest first,
// closed listings included (SP3 spec 5 and 8.8). `before` is the previous page's `nextBefore`;
// a malformed one is a 400. The date lines use the viewer's time zone (`tz` or the ee_tz
// cookie).
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { listSavedJobs, listSkippedJobs } from '@/modules/discovery';
import { getViewer, privateJson } from '@/server/viewer';

const input = z.object({
  state: z.enum(['saved', 'skipped']),
  before: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  tz: z.string().max(64).optional(),
});

export const GET = apiRoute({
  auth: 'seeker',
  input,
  openapi: {
    method: 'GET',
    path: '/api/v1/me/dispositions',
    summary: "List the seeker's saved or skipped jobs, newest first",
  },
  handler: async ({ db, user, input, req }) => {
    if (!user) throw unauthorized();
    const { tz } = await getViewer(req);
    const list = input.state === 'saved' ? listSavedJobs : listSkippedJobs;
    return privateJson(await list(db, user.id, { limit: input.limit, before: input.before, tz }));
  },
});
