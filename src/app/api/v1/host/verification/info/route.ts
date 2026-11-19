// POST /api/v1/host/verification/info: answers an operator's question about the business
// (Owner and Admin). Body { text (at most 2,000 characters), websiteUrl? }; the verification
// goes back to review.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { requireCapability } from '@/modules/orgs';
import { submitVerificationInfo, verificationInfoSchema } from '@/modules/verification';
import { apiRoute } from '@/server/api';

const output = z.object({ status: z.literal('needs_review') });

export const POST = apiRoute({
  auth: 'host',
  input: verificationInfoSchema,
  openapi: {
    method: 'POST',
    path: '/api/v1/host/verification/info',
    summary: "Answer an operator's question about the business",
    output,
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'team.manage');
    return submitVerificationInfo(db, host, input);
  },
});
