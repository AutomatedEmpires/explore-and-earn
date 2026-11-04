// /api/v1/host/locations
// GET: the org's live locations (Owner, Admin or Recruiter; a Recruiter with an assigned scope
//   sees only the locations assigned to them).
// POST: add a location (Owner or Admin). Without a point the address is geocoded; a miss is
//   400 `geocode_failed` ("Drop a pin on the map instead").
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { kickWorker } from '@/modules/jobs';
import {
  createLocation,
  hostLocationJsonSchema,
  listHostLocations,
  locationInputSchema,
} from '@/modules/locations';
import { getListingAccess, requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  openapi: {
    method: 'GET',
    path: '/api/v1/host/locations',
    summary: "List the organization's locations (Recruiters see only their assigned ones)",
    output: z.array(hostLocationJsonSchema),
  },
  handler: async ({ db, host }) => {
    if (!host) throw unauthorized();
    // Owner, Admin and Recruiter: the people who work on listings at these locations.
    requireCapability(host, 'listings.manage');
    const [all, access] = await Promise.all([
      listHostLocations(db, host.orgId),
      getListingAccess(db, host),
    ]);
    if (access.all) return all;
    const allowed = new Set(access.locationIds);
    return all.filter((l) => allowed.has(l.id));
  },
});

export const POST = apiRoute({
  auth: 'host',
  input: locationInputSchema,
  openapi: {
    method: 'POST',
    path: '/api/v1/host/locations',
    summary: 'Add a location (geocoded from its address unless a point is given)',
    output: hostLocationJsonSchema,
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'locations.manage');
    const location = await createLocation(db, host, input);
    kickWorker();
    return location;
  },
});
