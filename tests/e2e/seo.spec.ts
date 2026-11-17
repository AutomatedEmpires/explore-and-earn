// Sitemap, listing JSON-LD and robots (SP3 plan Task 42). The listing ids come from Task 27's
// seed file, tests/e2e/.seed.json, written by `pnpm e2e:seed`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

type Fixture = { id: string; slug: string };
type Seed = { listings: { liftOperator: Fixture; closed: Fixture } };

function readSeed(): Seed {
  const file = path.join(process.cwd(), 'tests', 'e2e', '.seed.json');
  return JSON.parse(readFileSync(file, 'utf8')) as Seed;
}

test('sitemaps, listing JSON-LD and robots', async ({ request }) => {
  const seed = readSeed();
  const lift = `/jobs/view/${seed.listings.liftOperator.id}/${seed.listings.liftOperator.slug}`;

  const index = await request.get('/sitemap.xml');
  expect(index.ok()).toBe(true);
  expect(index.headers()['content-type'] ?? '').toContain('application/xml');
  expect(await index.text()).toContain('jobs-1');
  expect(index.headers()['x-robots-tag'] ?? '').toContain('noindex');

  const jobs = await request.get('/sitemaps/jobs-1.xml');
  expect(jobs.ok()).toBe(true);
  expect(await jobs.text()).toContain(lift);

  const listing = await request.get(lift);
  expect(listing.ok()).toBe(true);
  const html = await listing.text();
  const jsonLd = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  expect(jsonLd?.[1]).toBeTruthy();
  expect((JSON.parse(jsonLd?.[1] ?? '{}') as { '@type'?: string })['@type']).toBe('JobPosting');

  const closed = await request.get(
    `/jobs/view/${seed.listings.closed.id}/${seed.listings.closed.slug}`,
  );
  const closedHtml = await closed.text();
  expect(closedHtml).toContain('content="noindex"');
  expect(closedHtml).not.toContain('application/ld+json');

  const seek = await request.get('/?cat=farm');
  const seekHtml = await seek.text();
  expect(seekHtml).toContain('noindex, follow');
  expect(seekHtml).toMatch(/rel="canonical" href="(?:https?:\/\/[^"]+)?\/"/);
});
