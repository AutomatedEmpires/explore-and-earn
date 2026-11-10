// Landing page resolution: a path to a pre-filtered query with its copy (SP3 spec 3.2 and
// 8.11). W0 stub: W8 replaces the functions (Task 40). The types and the official visa links
// are final.
import type { DbOrTx } from '@/lib/db';
import type { DiscoveryQuery } from '@/modules/discovery';

export type LandingKind =
  | 'state'
  | 'category'
  | 'category_state'
  | 'category_genre'
  | 'season'
  | 'destination'
  | 'international';

export type LandingPage = {
  key: string;
  kind: LandingKind;
  path: string;
  title: string;
  intro: string;
  hero: { url: string; alt: string } | null;
  seoTitle: string;
  seoDescription: string;
  query: DiscoveryQuery;
  /** At least one active listing matches; otherwise noindex and out of the sitemap. */
  indexable: boolean;
  breadcrumbs: { name: string; path: string }[];
};

/** The only pages /international links to: we can't give visa advice (spec 8.11). */
export const OFFICIAL_VISA_LINKS: readonly { label: string; url: string }[] = [
  {
    label: 'U.S. visas (U.S. Department of State)',
    url: 'https://travel.state.gov/content/travel/en/us-visas.html',
  },
  { label: 'J-1 Exchange Visitor Program', url: 'https://j1visa.state.gov/' },
  {
    label: 'Foreign labor certification (U.S. Department of Labor)',
    url: 'https://www.dol.gov/agencies/eta/foreign-labor',
  },
  { label: 'U.S. Citizenship and Immigration Services', url: 'https://www.uscis.gov/' },
];

/** The landing page at `path`, or null when the path is not one. */
export async function resolveLanding(
  _db: DbOrTx,
  _path: string,
  _now: Date,
): Promise<LandingPage | null> {
  throw new Error('not implemented: resolveLanding');
}

/** Indexable landing paths only (the landing sitemap). */
export async function listLandingPaths(_db: DbOrTx): Promise<{ path: string; lastmod: Date }[]> {
  throw new Error('not implemented: listLandingPaths');
}
