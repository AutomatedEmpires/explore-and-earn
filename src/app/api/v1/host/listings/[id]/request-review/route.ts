// POST /api/v1/host/listings/{id}/request-review: "Ask for a review" of a returned or removed
// listing. Body { note (<= 1,000) } -> { ok: true }. Limited to 5 an hour per org.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { REVIEW_NOTE_MAX, requestReview } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: z.object({ id: z.uuid(), note: z.string().trim().min(1).max(REVIEW_NOTE_MAX) }),
  rateLimit: {
    key: (ctx) => `listings:review:${ctx.host?.orgId}`,
    limit: 5,
    windowSec: 3600,
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    await requestReview(db, host, input.id, input.note);
    return { ok: true };
  },
});
