// Sitemaps rendered per request from the projection, and robots.txt per environment (SP3 spec
// 5 and 8.11, plan Task 42). Job URLs are chunked at 10,000. Closed listings are absent.
import type { MetadataRoute } from 'next';
import type { DbOrTx } from '@/lib/db';
import { listActiveListings } from '@/modules/discovery';
import { listPublicHostSlugs } from '@/modules/hostpages';
import { listLandingPaths } from './resolve';

const CHUNK = 10_000;

const PRIVATE_PREFIXES = [
  '/api/',
  '/host',
  '/admin',
  '/profile',
  '/community',
  '/apply',
  '/sign-in',
  '/sign-up',
  '/onboarding',
  '/design-system',
] as const;

/** How many 10,000-row job sitemap files the active feed fills. Empty still publishes jobs-1. */
async function jobPageCount(db: DbOrTx): Promise<number> {
  let after: string | undefined;
  let pages = 0;
  for (;;) {
    const page = await listActiveListings(db, { after, limit: CHUNK });
    if (page.items.length === 0) return Math.max(1, pages);
    pages += 1;
    if (!page.next) return pages;
    after = page.next;
  }
}

/** ['jobs-1', …, 'jobs-N', 'landing', 'hosts']. */
export async function sitemapNames(db: DbOrTx): Promise<string[]> {
  const pages = await jobPageCount(db);
  return [...Array(pages).keys()].map((index) => `jobs-${index + 1}`).concat(['landing', 'hosts']);
}

async function jobEntries(
  db: DbOrTx,
  page: number,
): Promise<{ loc: string; lastmod: Date }[]> {
  if (!Number.isInteger(page) || page < 1) return [];
  let after: string | undefined;
  for (let index = 1; index <= page; index += 1) {
    const result = await listActiveListings(db, { after, limit: CHUNK });
    if (index === page) {
      return result.items.map((item) => ({
        loc: `/jobs/view/${item.listingId}/${item.slug}`,
        lastmod: item.indexedAt,
      }));
    }
    if (!result.next) return [];
    after = result.next;
  }
  return [];
}

async function hostEntries(db: DbOrTx): Promise<{ loc: string; lastmod: Date }[]> {
  const entries: { loc: string; lastmod: Date }[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await listPublicHostSlugs(db, { after, limit: 1000 });
    for (const item of page.items) {
      entries.push({ loc: `/hosts/${item.slug}`, lastmod: item.updatedAt });
    }
    if (!page.next) return entries;
    after = page.next;
  }
}

export async function sitemapEntries(
  db: DbOrTx,
  name: string,
): Promise<{ loc: string; lastmod: Date }[]> {
  const jobs = /^jobs-(\d+)$/.exec(name);
  if (jobs) {
    const page = Number(jobs[1]);
    if (!Number.isInteger(page) || page < 1) return [];
    return jobEntries(db, page);
  }
  if (name === 'landing') {
    return (await listLandingPaths(db)).map((entry) => ({ loc: entry.path, lastmod: entry.lastmod }));
  }
  if (name === 'hosts') return hostEntries(db);
  return [];
}

function xmlEscape(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

/** The /sitemap.xml index. */
export function renderSitemapIndex(names: string[], appUrl: string): string {
  const base = appUrl.replace(/\/$/, '');
  const body = names
    .map(
      (name) =>
        `  <sitemap><loc>${xmlEscape(`${base}/sitemaps/${name}.xml`)}</loc></sitemap>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/** One /sitemaps/<name>.xml urlset. */
export function renderUrlset(entries: { loc: string; lastmod: Date }[]): string {
  const body = entries
    .map(
      (entry) =>
        `  <url><loc>${xmlEscape(entry.loc)}</loc><lastmod>${entry.lastmod.toISOString()}</lastmod></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** Prod allows / and disallows the private areas; everywhere else disallows everything. */
export function buildRobots(
  appEnv: 'dev' | 'preview' | 'prod',
  appUrl: string,
): MetadataRoute.Robots {
  if (appEnv !== 'prod') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] },
    sitemap: `${appUrl.replace(/\/$/, '')}/sitemap.xml`,
  };
}
