// Destinations (SP2 spec section 4): national parks, resort areas and regions, seeded by
// drizzle/1110_destinations_seed.sql. SP3 builds landing pages from them, and Seasonal listings
// name one in `genreDetails.destinationSlug`.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { destinations } from './schema';

/** Active destinations, sorted by name (in English collation, whatever the database's is). */
export async function listDestinations(
  db: DbOrTx,
): Promise<{ slug: string; name: string; states: string[] }[]> {
  const rows = await db
    .select({ slug: destinations.slug, name: destinations.name, states: destinations.states })
    .from(destinations)
    .where(eq(destinations.active, true));
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.slug.localeCompare(b.slug));
}
