// /api/v1/me/dispositions/[listingId] (SP3 spec 5 and 8.8), seekers only, sharing 120 changes a
// minute per seeker.
// PUT { state, source, expectedState? }: save or skip a listing, returning { state, previous }.
//   409 when expectedState no longer matches ("This job changed in another tab.") or at the
//   saved limit; 404 "This job just closed." when the listing is not active.
// DELETE { expectedState? }: clear the save or skip, returning { previous }.
import { z } from 'zod';
import { DISCOVERY_SOURCES } from '@/lib/discovery';
import { unauthorized } from '@/lib/errors';
import { clearDisposition, setDisposition } from '@/modules/discovery';
import { apiRoute, type ApiContext } from '@/server/api';
import { privateJson } from '@/server/viewer';

const state = z.enum(['saved', 'skipped']);
const listingId = z.string().min(1).max(64);

const putInput = z.object({
  listingId,
  state,
  // An unknown source is attributed to 'other' rather than failing the save (spec 8.12).
  source: z.enum(DISCOVERY_SOURCES).catch('other'),
  expectedState: state.nullable().optional(),
});

const deleteInput = z.object({ listingId, expectedState: state.optional() });

/** PUT and DELETE count against one bucket per seeker. */
const rateLimit = {
  key: (ctx: Pick<ApiContext<unknown>, 'user'>) => `disp:${ctx.user?.id}`,
  limit: 120,
  windowSec: 60,
};

export const PUT = apiRoute({
  auth: 'seeker',
  input: putInput,
  rateLimit,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/dispositions/{listingId}',
    summary: 'Save or skip a listing',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return privateJson(
      await setDisposition(db, {
        userId: user.id,
        listingId: input.listingId,
        state: input.state,
        source: input.source,
        expectedState: input.expectedState,
      }),
    );
  },
});

export const DELETE = apiRoute({
  auth: 'seeker',
  input: deleteInput,
  rateLimit,
  openapi: {
    method: 'DELETE',
    path: '/api/v1/me/dispositions/{listingId}',
    summary: 'Clear the save or skip of a listing',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return privateJson(
      await clearDisposition(db, {
        userId: user.id,
        listingId: input.listingId,
        expectedState: input.expectedState,
      }),
    );
  },
});
