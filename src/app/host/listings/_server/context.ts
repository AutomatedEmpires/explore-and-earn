// Server data for the listings screens: the organization's name and the builder's reference
// lists (occupations and destinations live in the database). Server-only.
import 'server-only';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { listOccupations } from '@/modules/listings';
import { listDestinations } from '@/modules/locations';
import { getOrgSummaries } from '@/modules/orgs';
import type { Destination, Occupation } from '../_lib/sample';

export async function orgName(orgId: string): Promise<string> {
  const org = (await getOrgSummaries(getDb(), [orgId])).get(orgId);
  return org?.name ?? 'Your organization';
}

/** Never fails the page: an empty list shows "Choose one" with nothing to pick, and is logged. */
export async function builderReferences(): Promise<{
  occupations: Occupation[];
  destinations: Destination[];
}> {
  const db = getDb();
  const [occupations, destinations] = await Promise.all([
    listOccupations(db).catch((err: unknown) => {
      logger.warn('listing builder: occupations failed', { err });
      return [];
    }),
    listDestinations(db).catch((err: unknown) => {
      logger.warn('listing builder: destinations failed', { err });
      return [];
    }),
  ]);
  return {
    occupations: occupations.map((o) => ({
      code: o.code,
      label: o.label,
      categories: o.categories,
    })),
    destinations: destinations.map((d) => ({ slug: d.slug, name: d.name })),
  };
}
