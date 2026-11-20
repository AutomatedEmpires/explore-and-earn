// Sitemaps rendered per request from the projection, and robots.txt per environment (SP3 spec
// 5 and 8.11). W0 stub: W8 replaces it (Task 42).
import type { MetadataRoute } from 'next';
import type { DbOrTx } from '@/lib/db';

/** ['jobs-1', …, 'jobs-N', 'landing', 'hosts']. */
export async function sitemapNames(_db: DbOrTx): Promise<string[]> {
  throw new Error('not implemented: sitemapNames');
}

export async function sitemapEntries(
  _db: DbOrTx,
  _name: string,
): Promise<{ loc: string; lastmod: Date }[]> {
  throw new Error('not implemented: sitemapEntries');
}

/** The /sitemap.xml index. */
export function renderSitemapIndex(_names: string[], _appUrl: string): string {
  throw new Error('not implemented: renderSitemapIndex');
}

/** One /sitemaps/<name>.xml urlset. */
export function renderUrlset(_entries: { loc: string; lastmod: Date }[]): string {
  throw new Error('not implemented: renderUrlset');
}

/** Prod allows / and disallows the private areas; everywhere else disallows everything. */
export function buildRobots(
  _appEnv: 'dev' | 'preview' | 'prod',
  _appUrl: string,
): MetadataRoute.Robots {
  throw new Error('not implemented: buildRobots');
}
