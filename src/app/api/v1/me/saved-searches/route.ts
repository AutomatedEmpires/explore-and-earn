// /api/v1/me/saved-searches (SP3 spec 5 and 8.10), seekers only.
// GET: the seeker's job alerts, oldest first, each with a fresh summary.
// POST { query, name? }: saves the search. 201 with the new item; 200 with the existing one when
//   the seeker already has these filters; 409 at discovery.saved_searches_per_user. Writes share
//   one bucket of 30 an hour per seeker (`ss:<userId>`).
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { z } from 'zod';
import { discoveryQuerySchema } from '@/lib/discovery';
import { unauthorized } from '@/lib/errors';
import { createSavedSearch, listSavedSearches } from '@/modules/discovery';
import { privateJson } from '@/server/viewer';
import { savedSearchRateLimit } from './rate-limit';

const postInput = z.object({
  query: discoveryQuerySchema,
  // Trimmed and held to 1–80 characters by createSavedSearch.
  name: z.string().max(200).optional(),
});

export const GET = apiRoute({
  auth: 'seeker',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/saved-searches',
    summary: "List the seeker's job alerts",
  },
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    return privateJson({ items: await listSavedSearches(db, user.id) });
  },
});

export const POST = apiRoute({
  auth: 'seeker',
  input: postInput,
  rateLimit: savedSearchRateLimit,
  openapi: {
    method: 'POST',
    path: '/api/v1/me/saved-searches',
    summary: 'Save a search as a job alert (200 when the seeker already has it)',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const { item, created } = await createSavedSearch(db, user.id, {
      query: input.query,
      name: input.name,
    });
    return privateJson(item, { status: created ? 201 : 200 });
  },
});
