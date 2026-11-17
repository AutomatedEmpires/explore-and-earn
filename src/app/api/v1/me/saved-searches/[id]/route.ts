// /api/v1/me/saved-searches/[id] (SP3 spec 5 and 8.10), seekers only, on the seeker's own
// job alerts; anyone else's (or an unknown id) is 404.
// PATCH { name?, pushEnabled?, emailDaily? }: returns the item.
// DELETE: removes the alert and its matches; 204.
// Both count against the `ss:<userId>` bucket, 30 an hour.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { deleteSavedSearch, updateSavedSearch } from '@/modules/discovery';
import { privateJson } from '@/server/viewer';
import { savedSearchRateLimit } from '../rate-limit';

const id = z.string().min(1).max(64);

const patchInput = z.object({
  id,
  // Trimmed and held to 1–80 characters by updateSavedSearch.
  name: z.string().max(200).optional(),
  pushEnabled: z.boolean().optional(),
  emailDaily: z.boolean().optional(),
});

export const PATCH = apiRoute({
  auth: 'seeker',
  input: patchInput,
  rateLimit: savedSearchRateLimit,
  openapi: {
    method: 'PATCH',
    path: '/api/v1/me/saved-searches/{id}',
    summary: 'Rename a job alert or switch its push and daily email',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return privateJson(
      await updateSavedSearch(db, user.id, input.id, {
        name: input.name,
        pushEnabled: input.pushEnabled,
        emailDaily: input.emailDaily,
      }),
    );
  },
});

export const DELETE = apiRoute({
  auth: 'seeker',
  input: z.object({ id }),
  rateLimit: savedSearchRateLimit,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/me/saved-searches/{id}',
    summary: 'Delete a job alert and its matches',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await deleteSavedSearch(db, user.id, input.id);
    return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } });
  },
});
