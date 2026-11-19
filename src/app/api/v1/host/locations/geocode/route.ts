// POST /api/v1/host/locations/geocode: address candidates for the location picker (Owner or
// Admin; 30 per minute per org). An empty list means "Drop a pin on the map instead".
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { geocodeAddress, geocodeInputSchema } from '@/modules/locations';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

const output = z.object({
  candidates: z.array(z.object({ lat: z.number(), lng: z.number(), matched: z.string() })),
});

export const POST = apiRoute({
  auth: 'host',
  input: geocodeInputSchema,
  rateLimit: { key: (ctx) => `locations-geocode:${ctx.host?.orgId}`, limit: 30, windowSec: 60 },
  openapi: {
    method: 'POST',
    path: '/api/v1/host/locations/geocode',
    summary: 'Find map points for a US street address',
    output,
  },
  handler: async ({ host, input }) => {
    if (!host) throw unauthorized();
    requireCapability(host, 'locations.manage');
    return geocodeAddress(input);
  },
});
