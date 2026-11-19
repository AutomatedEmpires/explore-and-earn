// POST /api/v1/applications (SP4 spec 5 and 8.4): a seeker applies to a listing. 201 with
// `created: true` the first time; 200 with `created: false` and the same receipt for a retry, a
// double tap, or a listing the seeker already applied to (a withdrawn application included).
// At most 30 a day per seeker.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { track } from '@/lib/analytics';
import { unauthorized } from '@/lib/errors';
import {
  APPLICATION_SOURCES,
  RATE_LIMITS,
  submitApplication,
  submitApplicationSchema,
} from '@/modules/applications';
import { kickWorker } from '@/modules/jobs';
import { privateJson } from '@/server/viewer';

export const POST = apiRoute({
  auth: 'seeker',
  input: submitApplicationSchema,
  rateLimit: {
    key: (c) => `${RATE_LIMITS.apply.key}:${c.user?.id}`,
    limit: RATE_LIMITS.apply.limit,
    windowSec: RATE_LIMITS.apply.windowSec,
  },
  openapi: {
    method: 'POST',
    path: '/api/v1/applications',
    summary: 'Apply to a listing',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const result = await submitApplication(db, user.id, input);
    if (result.created) {
      kickWorker();
      // Ids and enums only (spec 10).
      const source = (APPLICATION_SOURCES as readonly string[]).includes(input.source)
        ? input.source
        : 'other';
      track('application_submitted', { listingId: input.listingId, source }, user.id);
    }
    return privateJson(result, { status: result.created ? 201 : 200 });
  },
});
