// GET /api/v1/host/listings/{id}/candidates (SP5 spec 5 and 8.2, plan Task 13): one page of the
// listing's candidate pool -> { items: PoolCardData[], nextCursor, creditsRemaining, fitAvailable }.
// `id` is the listing (plan decision 8). The only filters are state, available-by and skills.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { candidatesQuerySchema, idParamSchema, POOL } from '@/lib/hiring';
import { listCandidates } from '@/modules/hiring';
import { requireHiringCapability } from '@/modules/messaging';
import { apiRoute } from '@/server/api';
import { privateJson } from '@/server/viewer';

// A query string repeats `skills` for several values and sends one value as a plain string.
const skills = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : [value]))
  .pipe(z.array(z.string()).max(POOL.maxSkillFilters))
  .optional();

export const GET = apiRoute({
  auth: 'host',
  input: candidatesQuerySchema.extend({ ...idParamSchema.shape, skills }),
  openapi: { method: 'GET', path: '/api/v1/host/listings/{id}/candidates', summary: 'List candidates' },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'applicants.access');
    const { id, ...query } = input;
    return privateJson(await listCandidates(db, host, { ...query, listingId: id }));
  },
});
