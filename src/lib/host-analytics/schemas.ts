import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d', 'season', 'all']),
  listingId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  tz: z.string().min(1),
});
