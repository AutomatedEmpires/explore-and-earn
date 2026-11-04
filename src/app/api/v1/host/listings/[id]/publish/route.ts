// POST /api/v1/host/listings/{id}/publish: ask to publish the draft. Body
// { acknowledgedWarnings: string[] } -> { state, reviewStage }. 400 with `details.issues`;
// 409 `listing_slot_limit`, `not_entitled`, `past_due`, `org_suspended`, `verification_failed`,
// `already_in_review` or `not_publishable`.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { kickWorker } from '@/modules/jobs';
import { requestPublish } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const POST = apiRoute({
  auth: 'host',
  input: z.object({
    id: z.uuid(),
    acknowledgedWarnings: z.array(z.string().max(100)).max(50).default([]),
  }),
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    const result = await requestPublish(db, host, input.id, input.acknowledgedWarnings);
    kickWorker();
    return result;
  },
});
