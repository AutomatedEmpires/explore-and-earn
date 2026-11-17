// /api/v1/me/alert-settings (SP3 spec 5 and 8.10), seekers only.
// GET: { weeklyDigest }, false until the seeker turns the weekly digest on.
// PATCH { weeklyDigest }: sets it, counting against the job alerts' `ss:<userId>` bucket.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { getAlertSettings, setAlertSettings } from '@/modules/discovery';
import { privateJson } from '@/server/viewer';
import { savedSearchRateLimit } from '../saved-searches/rate-limit';

export const GET = apiRoute({
  auth: 'seeker',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/alert-settings',
    summary: "Read the seeker's job alert settings",
  },
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    return privateJson(await getAlertSettings(db, user.id));
  },
});

export const PATCH = apiRoute({
  auth: 'seeker',
  input: z.object({ weeklyDigest: z.boolean() }),
  rateLimit: savedSearchRateLimit,
  openapi: {
    method: 'PATCH',
    path: '/api/v1/me/alert-settings',
    summary: 'Turn the weekly job digest on or off',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return privateJson(await setAlertSettings(db, user.id, { weeklyDigest: input.weeklyDigest }));
  },
});
