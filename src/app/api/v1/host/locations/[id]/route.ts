// /api/v1/host/locations/[id] (Owner or Admin). Another org's location is 404.
// PATCH: edit a location; only the fields given change, and a new address without a point is
//   geocoded again.
// DELETE: archive it. 409 `location_in_use` while an active listing uses it.
import { z } from 'zod';
import { conflict, notFound, unauthorized } from '@/lib/errors';
import { countActiveByLocation } from '@/modules/listings';
import { kickWorker } from '@/modules/jobs';
import {
  archiveLocation,
  getLocations,
  hostLocationJsonSchema,
  locationPatchSchema,
  updateLocation,
} from '@/modules/locations';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const PATCH = apiRoute({
  auth: 'host',
  input: locationPatchSchema.extend({ id: z.uuid() }),
  openapi: {
    method: 'PATCH',
    path: '/api/v1/host/locations/{id}',
    summary: 'Edit a location',
    output: hostLocationJsonSchema,
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'locations.manage');
    const { id, ...patch } = input;
    const location = await updateLocation(db, host, id, patch);
    kickWorker();
    return location;
  },
});

export const DELETE = apiRoute({
  auth: 'host',
  input: z.object({ id: z.uuid() }),
  openapi: {
    method: 'DELETE',
    path: '/api/v1/host/locations/{id}',
    summary: 'Archive a location that no active listing uses',
    output: z.object({ ok: z.literal(true) }),
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'locations.manage');
    const location = (await getLocations(db, [input.id])).get(input.id);
    if (!location || location.orgId !== host.orgId) throw notFound('Location not found');
    if (!location.archived) {
      const active = (await countActiveByLocation(db, [input.id])).get(input.id) ?? 0;
      if (active > 0) {
        throw conflict('An active listing uses this location. Close it or move it first.', {
          reason: 'location_in_use',
        });
      }
    }
    await archiveLocation(db, host, input.id);
    return { ok: true as const };
  },
});
