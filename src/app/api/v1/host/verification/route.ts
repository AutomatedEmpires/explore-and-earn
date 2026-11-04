// GET /api/v1/host/verification: the org's business verification status and, while an operator
// is waiting for an answer, their question (Owner and Admin).
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { requireCapability } from '@/modules/orgs';
import { getVerificationDetails } from '@/modules/verification';
import { apiRoute } from '@/server/api';

const output = z.object({
  status: z.enum(['unverified', 'running', 'verified', 'needs_review', 'needs_info', 'failed']),
  infoRequest: z.string().nullable(),
});

export const GET = apiRoute({
  auth: 'host',
  openapi: {
    method: 'GET',
    path: '/api/v1/host/verification',
    summary: "The organization's business verification status and any open question",
    output,
  },
  handler: async ({ db, host }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'team.manage');
    return getVerificationDetails(db, host.orgId);
  },
});
