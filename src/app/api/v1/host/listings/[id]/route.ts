// /api/v1/host/listings/{id}
// GET: the builder's view of a listing (draft, versions, live and pending revisions, checklist).
// DELETE: delete a listing that was never published -> { ok: true }.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { deleteListing, getListingForEditor } from '@/modules/listings';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

const input = z.object({ id: z.uuid() });

export const GET = apiRoute({
  auth: 'host',
  input,
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    return getListingForEditor(db, host, input.id);
  },
});

export const DELETE = apiRoute({
  auth: 'host',
  input,
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'listings.manage');
    await deleteListing(db, host, input.id);
    return { ok: true };
  },
});
