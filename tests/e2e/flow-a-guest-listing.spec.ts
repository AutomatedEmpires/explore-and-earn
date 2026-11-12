// Flow A (issue #109): a guest opens a shared listing. Figma page 02 Seeker: Detail · guest at 390
// (45:7496, 176:13308), 768 (45:7566), 1440 side panel (45:7615), 390 dark (45:9597), signed-in
// (45:7665) and the endings (178:16020). The spec seeds its own listings through the SP2 modules
// (see seedScript) and serves the seeded photos from public/design-system/samples.
//
// Run against `pnpm dev` on `pnpm db:local`, with the Clerk development keys in the environment
// (the dev server cannot start Clerk without them):
//   pnpm e2e tests/e2e/flow-a-guest-listing.spec.ts --project=chromium
// Screenshots are written to tests/e2e/__screenshots__/flow-a-guest-listing.spec.ts/.
//
// There is no loading frame on a direct load: the facts must be in the first HTML (flow A), so the
// route has no loading.tsx, and the first test fails if a skeleton is ever streamed first. The
// skeleton (DetailSkeleton) is for the in-app side panel route.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { ListingContent } from '@/modules/listings';

type Ref = { id: string; slug: string };
type Seeded = { active: Ref; closed: Ref; broken: Ref; media: Map<string, string> };

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SAMPLES = path.join(ROOT, 'public', 'design-system', 'samples');
const SHOTS = path.join(import.meta.dirname, '__screenshots__', 'flow-a-guest-listing.spec.ts');

const STUBS = {
  AI_PROVIDER: 'stub',
  CHILD_SAFETY_PROVIDER: 'stub',
  MALWARE_PROVIDER: 'stub',
  BILLING_PROVIDER: 'stub',
  GEOCODER_PROVIDER: 'stub',
  WEATHER_PROVIDER: 'stub',
  LINK_SAFETY_PROVIDER: 'stub',
  EMAIL_PROVIDER: 'stub',
  STORAGE_PROVIDER: 'local',
} as const;

const HOUSING_SAMPLES = ['bedroom.svg', 'cabin.svg', 'kitchen.svg', 'lake.svg'];
const MEAL_SAMPLES = ['kitchen.svg', 'farm.svg', 'cabin.svg', 'harbor.svg'];

/** The page 02 sample: Lodge housekeeper at Kettle Ridge Lodge. */
function lodgeHousekeeper(c: ListingContent): void {
  c.basics = { ...c.basics, title: 'Lodge housekeeper', occupationCode: 'housekeeper' };
  c.when = {
    dates: { mode: 'fixed', start: '2027-05-15', end: '2027-10-02' },
    weeklyHours: 40,
    minCommitment: 'Stay through Sep 15 at least',
  };
  c.pay = {
    kind: 'fixed',
    minCents: 2200,
    maxCents: 2200,
    unit: 'hour',
    crewShareEstimate: null,
    overtime: false,
    tips: true,
    bonuses: '$500 if you stay to Oct 2',
    frequency: 'biweekly',
    deductions: null,
  };
  if (c.housing.provided) {
    c.housing = {
      ...c.housing,
      type: 'cabin',
      cost: { free: false, cents: 1200, period: 'day', paidBy: 'deducted' },
      note: 'Two staff per cabin',
      finePrint: {
        roommates: 1,
        pets: false,
        couples: true,
        wifi: true,
        utilitiesIncluded: true,
        notes: null,
      },
    };
  }
  c.meals = {
    provided: true,
    perDay: 3,
    days: 'every_day',
    cost: { free: true },
    photos: {
      kitchen: '00000000-0000-4000-8000-000000000011',
      meal_example: '00000000-0000-4000-8000-000000000012',
      dining_area: '00000000-0000-4000-8000-000000000013',
      other: '00000000-0000-4000-8000-000000000014',
    },
    note: 'Staff dining hall, vegetarian every day',
    dietary: null,
  };
  c.genreDetails = {
    category: 'seasonal',
    destinationSlug: null,
    staffPerks: ['Staff events and trips'],
  };
  c.job = {
    ...c.job,
    description:
      'Keep 14 guest cabins clean and ready, with a team of four. Restock linens, report repairs, and help the front desk on busy Saturdays.',
    responsibilities: [],
    typicalDay: 'Team list at 8 AM, cabins from 9 to 3, laundry and restock after.',
    requiredQualifications: ['One season of housekeeping or hotel work'],
    preferredQualifications: ['Laundry or guest service experience'],
    skills: [],
    certifications: [],
    physicalDemands: 'On your feet most of the day, lifting up to 25 lb',
    perks: ['park_pass', 'shuttle'],
  };
}

/**
 * The seeding script. The SP2 write helpers import `next/server` without an extension, which
 * tsx resolves and Playwright's loader does not, so the spec runs them the way `pnpm e2e:seed`
 * does: a tsx script (in the git-ignored .data folder) that prints the seeded ids.
 */
function seedScript(): string {
  return `
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
const ROOT = ${JSON.stringify(ROOT)};
const at = (p) => pathToFileURL(path.join(ROOT, p)).href;
for (const name of ['.env.local', '.env.local.example']) {
  const file = path.join(ROOT, name);
  if (!existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}
Object.assign(process.env, ${JSON.stringify(STUBS)});
const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://invalid').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(dbHost)) {
  throw new Error('flow A e2e: refusing to seed a database that is not on localhost');
}
const { resetEnvCache } = await import(at('src/lib/env.ts'));
resetEnvCache();
const { getDb, closeDb, queryRows } = await import(at('src/lib/db.ts'));
const { sql } = await import('drizzle-orm');
const writes = await import(at('tests/e2e/fixtures/sp2-writes.ts'));
const lodgeHousekeeper = ${lodgeHousekeeper.toString()};
const db = getDb();

async function ensure(host, title, edit) {
  const existing = await writes.findListingByTitle(db, host.orgId, title);
  if (existing?.state === 'in_review') await writes.drainUntilEmpty(db);
  const again = existing ? await writes.findListingByTitle(db, host.orgId, title) : null;
  if (again?.state === 'active' || again?.state === 'closed') {
    return { ...(await writes.listingFixture(db, again.id, title)), state: again.state };
  }
  if (again?.state === 'draft') await writes.discardDraft(db, host, again.id);
  const published = await writes.publishListing(db, host, edit);
  return { ...(await writes.listingFixture(db, published.id, title)), state: 'active' };
}

const kettle = await writes.seedHost(db, {
  name: 'Kettle Ridge Lodge',
  city: 'Whitefish',
  state: 'MT',
  point: { lat: 48.4106, lng: -114.3528 },
  publicPrecision: 'city',
  timezone: 'America/Denver',
});
const active = await ensure(kettle, 'Lodge housekeeper', lodgeHousekeeper);
const closed = await ensure(kettle, 'Lodge night porter', (c) => {
  lodgeHousekeeper(c);
  c.basics.title = 'Lodge night porter';
});
if (closed.state === 'active') await writes.closeListingAs(db, kettle, closed.id);
const broken = await ensure(kettle, 'Lodge laundry lead', (c) => {
  lodgeHousekeeper(c);
  c.basics.title = 'Lodge laundry lead';
});
await writes.drainUntilEmpty(db);
// A stored revision the page cannot read, for the "Couldn't load this job" ending. Approved
// revisions are immutable (a trigger), so this throwaway local database skips triggers for the
// one update, after the outbox has drained.
await db.transaction(async (tx) => {
  await tx.execute(sql\`set local session_replication_role = replica\`);
  await tx.execute(sql\`
    update app.listing_revisions set content = jsonb_set(content, '{photos}', 'null'::jsonb)
    where id = (select published_revision_id from app.listings where id = \${broken.id}::uuid)
  \`);
});
const [rev] = await queryRows(db, sql\`
  select r.content from app.listings l
  join app.listing_revisions r on r.id = l.published_revision_id
  where l.id = \${active.id}::uuid
\`);
const c = rev.content;
const photos = {
  cover: c.photos.coverMediaId,
  housing: c.housing.provided ? Object.values(c.housing.photos) : [],
  meals: c.meals.provided ? Object.values(c.meals.photos) : [],
};
console.log('FLOW_A_SEED ' + JSON.stringify({ active, closed, broken, photos }));
await Promise.race([closeDb(), new Promise((resolve) => setTimeout(resolve, 5000))]);
process.exit(0);
`;
}

function seed(): Seeded {
  const dir = path.join(ROOT, '.data', 'e2e');
  mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'flow-a-seed.mts');
  writeFileSync(script, seedScript());
  const out = execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      '--import',
      './scripts/register-server-only.mjs',
      script,
    ],
    { cwd: ROOT, encoding: 'utf8', timeout: 280_000, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const line = out.split(/\r?\n/).find((l) => l.startsWith('FLOW_A_SEED '));
  if (!line) throw new Error('flow A e2e: the seed printed no result');
  const r = JSON.parse(line.slice('FLOW_A_SEED '.length)) as {
    active: Ref;
    closed: Ref;
    broken: Ref;
    photos: { cover: string; housing: string[]; meals: string[] };
  };
  const media = new Map<string, string>([[r.photos.cover, 'lake.svg']]);
  r.photos.housing.forEach((id, i) => media.set(id, HOUSING_SAMPLES[i] ?? 'cabin.svg'));
  r.photos.meals.forEach((id, i) => media.set(id, MEAL_SAMPLES[i] ?? 'kitchen.svg'));
  return { active: r.active, closed: r.closed, broken: r.broken, media };
}

let seeded: Seeded;
const listingPath = (r: Ref) => `/jobs/view/${r.id}/${r.slug}`;

/** Serves each seeded photo from the design-system samples (local storage has no files). */
async function routePhotos(page: Page): Promise<void> {
  await page.route(/\.webp(\?|$)/, async (route) => {
    const url = route.request().url();
    const id = [...seeded.media.keys()].find((k) => url.includes(k));
    const file = path.join(SAMPLES, (id && seeded.media.get(id)) || 'lake.svg');
    await route.fulfill({ contentType: 'image/svg+xml', body: readFileSync(file) });
  });
}

async function open(page: Page, width: number, height: number, ref?: Ref): Promise<void> {
  await page.setViewportSize({ width, height });
  await routePhotos(page);
  await page.goto(listingPath(ref ?? seeded.active));
  await page.evaluate(() => document.fonts.ready);
}

/** Hides the Next.js dev indicator, which only exists under `next dev`. */
async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage, animations: 'disabled' });
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('nextjs-portal')
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** One line of the deal list. Each line starts with a visually hidden label ("Pay: "). */
function dealLine(page: Page, text: string | RegExp) {
  return page.getByRole('list', { name: 'The deal' }).getByRole('listitem').filter({ hasText: text });
}

const FACTS = [
  '$22 an hour',
  'May 15 to Oct 2, 2027',
  'Cabin, $12 a night, taken from pay',
  '3 meals a day, free',
  'Couples housed',
];

// Serial: one seed, then the pages in order. `next dev` compiles each route on its first hit.
test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  seeded = seed();
});

test('the server sends the whole deal in the page HTML, signed out', async ({ request }) => {
  const res = await request.get(listingPath(seeded.active));
  expect(res.status()).toBe(200);
  const html = await res.text();
  for (const fact of FACTS) expect(html).toContain(fact.replaceAll('&', '&amp;'));
  expect(html).toMatch(/(Confirmed active|Posted) [^<]+/);
  expect(html).toContain('application/ld+json');
  // The facts are in the first HTML, not swapped in after a loading skeleton.
  expect(html).not.toContain('Loading the job');
});

test('390: the deal fits above the pinned Skip · Apply · Save bar, which sits on the tabs', async ({
  page,
}) => {
  await open(page, 390, 844);
  const bar = page.getByRole('group', { name: 'Actions for Lodge housekeeper' }).last();
  await expect(bar).toBeVisible();
  const barBox = await bar.boundingBox();
  const navBox = await page.getByRole('navigation', { name: 'Main' }).last().boundingBox();
  expect(barBox && navBox).toBeTruthy();
  if (!barBox || !navBox) return;
  expect(Math.abs(barBox.y + barBox.height - navBox.y)).toBeLessThanOrEqual(1);

  for (const fact of FACTS) {
    const box = await dealLine(page, fact).boundingBox();
    expect(box, fact).toBeTruthy();
    expect((box?.y ?? 9999) + (box?.height ?? 0), fact).toBeLessThanOrEqual(barBox.y);
  }
  const freshness = await dealLine(page, /(Confirmed active|Posted) /).boundingBox();
  expect((freshness?.y ?? 9999) + (freshness?.height ?? 0)).toBeLessThanOrEqual(barBox.y);
  await expect(page.getByRole('heading', { level: 1, name: 'Lodge housekeeper' })).toBeVisible();
  await expect(page.getByText('9 photos')).toBeVisible();
  await shot(page, 'detail-guest-390');
  await shot(page, 'detail-guest-390-full', true);
  await axe(page);

  // The bar stays pinned while the guest scrolls through the listing.
  await page.getByRole('heading', { name: 'Perks' }).scrollIntoViewIfNeeded();
  const pinned = await bar.boundingBox();
  expect(Math.abs((pinned?.y ?? 0) - barBox.y)).toBeLessThanOrEqual(1);
});

test('Apply goes to sign-in and on to the apply step; Save asks a guest to sign in', async ({
  page,
}) => {
  await open(page, 390, 844);
  const bar = page.getByRole('group', { name: 'Actions for Lodge housekeeper' }).last();
  const apply = bar.getByRole('link', { name: 'Apply' });
  await expect(apply).toHaveAttribute(
    'href',
    `/sign-in?redirect_url=${encodeURIComponent(`/apply/${seeded.active.id}?source=other`)}`,
  );
  await bar.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(/\/sign-in\?redirect_url=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get('redirect_url') ?? '')).toBe(
    listingPath(seeded.active),
  );
});

test('768: one column with the action row under the deal', async ({ page }) => {
  await open(page, 768, 1024);
  const bars = page.getByRole('group', { name: 'Actions for Lodge housekeeper' });
  await expect(bars.first()).toBeVisible();
  await expect(bars.last()).toBeHidden();
  await shot(page, 'detail-guest-768', true);
  await axe(page);
});

test('1440: the detail is a 600 px side panel with Close and a pinned bar', async ({ page }) => {
  await open(page, 1440, 900);
  const panel = page.getByRole('article', { name: 'Lodge housekeeper' });
  const box = await panel.boundingBox();
  expect(box?.width).toBe(600);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(1440);
  await expect(page.getByRole('link', { name: 'Close' })).toHaveAttribute('href', '/');
  const bar = page.getByRole('group', { name: 'Actions for Lodge housekeeper' }).last();
  const barBox = await bar.boundingBox();
  expect((barBox?.y ?? 0) + (barBox?.height ?? 0)).toBe(900);
  for (const fact of FACTS) await expect(dealLine(page, fact)).toBeVisible();
  await shot(page, 'detail-guest-1440');
  await axe(page);
});

test('390 dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, 390, 844);
  await shot(page, 'detail-guest-390-dark');
  await axe(page);
});

test('the facts paint within 5 s on 4G with no layout shift', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routePhotos(page);
  const cdp = await page.context().newCDPSession(page);
  // Lighthouse's mobile profile: 150 ms round trips, 1.6 Mbps down, 750 kbps up, 4x CPU.
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __lcp: number };
    w.__cls = 0;
    w.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[]) {
        if (!e.hadRecentInput) w.__cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) w.__lcp = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const started = Date.now();
  await page.goto(listingPath(seeded.active), { waitUntil: 'commit' });
  await expect(dealLine(page, FACTS[4] ?? '')).toBeVisible({
    timeout: 5_000,
  });
  const factsMs = Date.now() - started;
  await page.waitForLoadState('load');
  await page.waitForTimeout(1_000);
  const { cls, lcp } = await page.evaluate(() => {
    const w = window as unknown as { __cls: number; __lcp: number };
    return { cls: w.__cls, lcp: w.__lcp };
  });
  test.info().annotations.push({
    type: 'performance',
    description: `facts visible ${factsMs} ms, LCP ${Math.round(lcp)} ms, CLS ${cls.toFixed(4)} (next dev, throttled)`,
  });
  console.log(`flow A performance: facts ${factsMs} ms, LCP ${Math.round(lcp)} ms, CLS ${cls}`);
  expect(factsMs).toBeLessThan(5_000);
  expect(cls).toBeLessThan(0.1);
});

test('a wrong slug answers 308 to the canonical address', async ({ request }) => {
  const res = await request.get(`/jobs/view/${seeded.active.id}/wrong?source=seek`, {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(308);
  expect(res.headers().location).toContain(`${listingPath(seeded.active)}?source=seek`);
});

test('endings: not found is a 404 with a way back to Seek', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const res = await page.goto('/jobs/view/01a1cd82-0000-7000-8000-000000000000/nothing');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'We can’t find that job' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Search jobs' })).toHaveAttribute('href', '/');
  await shot(page, 'ending-not-found-390');
  await axe(page);
});

test('endings: a closed listing explains itself, has no Apply and is not indexed', async ({
  page,
}) => {
  await open(page, 390, 844, seeded.closed);
  await expect(page.getByText('This job is closed')).toBeVisible();
  await expect(page.getByRole('link', { name: 'See similar jobs' })).toHaveAttribute(
    'href',
    '/?cat=seasonal',
  );
  await expect(page.getByRole('button', { name: 'Follow Kettle Ridge Lodge' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Apply' })).toHaveCount(0);
  const html = await page.content();
  expect(html).toContain('noindex');
  expect(html).not.toContain('application/ld+json');
  await shot(page, 'ending-closed-390');
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, 'ending-closed-1440');
  await axe(page);
});

test('endings: couldn’t load, then offline, then back', async ({ page, context }) => {
  await open(page, 390, 844, seeded.broken);
  await expect(page.getByRole('heading', { name: 'Couldn’t load this job' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await shot(page, 'ending-error-390');
  await axe(page);
  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
  await shot(page, 'ending-offline-390');
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, 'ending-offline-1440');
  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Couldn’t load this job' })).toBeVisible();
});

test('signed in: the seeker bar and the same deal', async ({ page }) => {
  const { signInAsSeeker } = await import('./fixtures/auth');
  try {
    await signInAsSeeker(page);
  } catch (err) {
    test.skip(true, `no Clerk development instance: ${String(err)}`);
  }
  await open(page, 390, 844);
  await expect(page.getByRole('link', { name: 'Apply' }).last()).toHaveAttribute(
    'href',
    `/apply/${seeded.active.id}?source=other`,
  );
  const save = page.getByRole('group', { name: 'Actions for Lodge housekeeper' }).last()
    .getByRole('button', { name: 'Save' });
  await expect(save).toHaveAttribute('aria-pressed', /true|false/);
  await shot(page, 'detail-signed-in-390');
  await axe(page);
});
