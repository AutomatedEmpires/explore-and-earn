// Issue 208: the H-2B job order fields, against the approved frames (Figma PbAWCgi2JXiyl5PmbGvr9A,
// approved on #201):
// - the builder Job step (01 Host, "H-2B fields" 215:23546): filled 215:23547, empty 215:23710
//   and error 215:23897 at 390; 768 217:24023; 1440 217:24484 and its error 217:25079. For any
//   other visa the step is the approved 43:12041, unchanged;
// - the guest listing detail (02 Seeker, "H-2B fields" 223:20362): 390 223:20363, no terms added
//   223:20530, dark 223:20667, 768 223:20796 and the 1440 side panel 223:20970.
//
// The builder runs on the development-only preview route with a fake host API that holds to the
// real contract, as flow C does (a keyless Clerk development instance can't sign a host in): each
// autosave must pass the server's strict section schema. The detail is read signed out from a
// local database, seeded through the SP2 modules as flow A does.
//
// Run against `pnpm dev` on `pnpm db:local` (flow A has the PGlite connection string):
//   pnpm e2e tests/e2e/h2b-fields.spec.ts --project=chromium
// The builder tests need no database. Screenshots are written to test-results/h2b-fields/, or to
// $H2B_SHOTS; they are evidence for the PR, not baselines.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type { BuilderSection, ListingContent } from '@/modules/listings';
// The listings module's index loads the whole module, which Node can't import in the Playwright
// runner (see flow C). content.ts is the listing contract alone.
// eslint-disable-next-line no-restricted-imports -- see above
import { ListingDraftSchema, SECTION_CONTENT_KEYS } from '@/modules/listings/content';
import {
  SAMPLE_IDS,
  SAMPLE_LOCATIONS,
  SAMPLE_TEAM,
  sampleDraft,
} from '@/app/host/listings/_lib/sample';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SAMPLES = path.join(ROOT, 'public', 'design-system', 'samples');
const SHOTS = process.env.H2B_SHOTS ?? path.join(ROOT, 'test-results', 'h2b-fields');
const RULE = 'https://www.ecfr.gov/current/title-20/section-655.41';
const NAVIGATION = { timeout: 90_000 };

/** The host's answers in the builder frames (215:23547). */
const BUILDER_TERMS = {
  transportation:
    'We repay your fare here and meals on the way once you finish half the season. We pay your trip home when you finish or if we end the job early.',
  tools: 'Uniforms, cleaning supplies and carts, at no charge.',
  threeFourthsGuarantee:
    'We offer at least three-fourths of the job order hours in each 6-week period. If we offer fewer, we pay what you would have earned.',
  swaContact: 'Bozeman Job Service · (406) 555-0142',
  jobOrderNumber: 'MT 4417260',
};
/** The 74-character paste of the error frames (215:23897, 217:25079). */
const PASTED = `Job order MT 4417260, posted Nov 2, ${'x'.repeat(38)}`;

const LABELS = [
  'Travel to the job and home',
  'Tools and equipment',
  'Three-fourths hours guarantee',
  'State Workforce Agency office',
  'Job order number',
] as const;

// --- Shared helpers ---------------------------------------------------------------------------

async function seriousA11yIssues(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('nextjs-portal')
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** Hides development overlays (the Next.js indicator, Clerk's keyless prompt), waits for fonts. */
async function settle(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      'nextjs-portal, [data-clerk-keyless-prompt], .cl-keylessPrompt, [class*="keyless"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    const pause = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await pause();
    }
    window.scrollTo(0, 0);
    await document.fonts.ready;
  });
}

/** axe at the serious and critical levels, then a screenshot (the viewport, or `show` in view). */
async function check(page: Page, name: string, opts: { show?: Locator; fullPage?: boolean } = {}) {
  await settle(page);
  expect(await seriousA11yIssues(page), `axe on ${name}`).toEqual([]);
  mkdirSync(SHOTS, { recursive: true });
  if (opts.show) await opts.show.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  if (opts.fullPage) {
    // The whole page, taken by making the viewport as tall as the page: a full-page capture
    // draws fixed bars where the viewport happened to be, over the content.
    const size = page.viewportSize();
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    if (size && height > size.height) await page.setViewportSize({ width: size.width, height });
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), animations: 'disabled' });
    if (size) await page.setViewportSize(size);
    return;
  }
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), animations: 'disabled' });
}

// --- The builder (01 Host) --------------------------------------------------------------------

type FakeListing = {
  draft: Record<string, unknown>;
  versions: Partial<Record<BuilderSection, number>>;
  draftVersion: number;
};

/** The host API the builder calls, for one draft, checking each autosave against the contract. */
class FakeHost {
  listing: FakeListing;
  contractErrors: string[] = [];
  patches: { section: BuilderSection; data: Record<string, unknown> }[] = [];

  constructor(draft: Record<string, unknown>) {
    const versions = Object.fromEntries(
      Object.keys(SECTION_CONTENT_KEYS).map((s) => [s, 1]),
    ) as Partial<Record<BuilderSection, number>>;
    this.listing = { draft, versions, draftVersion: 9 };
  }

  async install(page: Page): Promise<void> {
    await page.route(/\/api\/v1\//, (route) => this.api(route).catch(() => undefined));
  }

  private json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  }

  private editor() {
    const l = this.listing;
    const at = new Date(2027, 0, 5, 18, 14).toISOString();
    return {
      listing: {
        id: SAMPLE_IDS.listing,
        state: 'draft',
        reviewStage: null,
        provenance: 'host_created',
        title: (l.draft.basics as { title?: string } | undefined)?.title ?? null,
        locationId: SAMPLE_IDS.location,
        copiedFromId: null,
        repostedFromId: null,
        firstPublishedAt: null,
        publishedAt: null,
        confirmedActiveAt: null,
        autoCloseAt: null,
        closedAt: null,
        closeReason: null,
        removedAt: null,
        createdAt: at,
        updatedAt: at,
      },
      draft: l.draft,
      draftVersion: l.draftVersion,
      sectionVersions: l.versions,
      live: null,
      pending: null,
      checklist: [],
      aiFilledFields: [],
    };
  }

  private async api(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    if (p === '/api/v1/me/stream') return route.fulfill({ status: 204 });
    if (p === '/api/v1/notifications')
      return this.json(route, { items: [], unread: 0, nextCursor: null });
    if (p === `/api/v1/host/listings/${SAMPLE_IDS.listing}` && method === 'GET')
      return this.json(route, this.editor());
    if (p === `/api/v1/host/listings/${SAMPLE_IDS.listing}/draft` && method === 'PATCH') {
      const b = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
      return this.patch(route, b);
    }
    if (p === '/api/v1/host/locations' && method === 'GET')
      return this.json(
        route,
        SAMPLE_LOCATIONS.map((l) => ({ ...l, archived: false })),
      );
    if (p === '/api/v1/host/team')
      return this.json(route, {
        members: SAMPLE_TEAM.map((t) => ({ ...t, role: 'owner' })),
        seats: { used: 3, limit: 5 },
      });
    if (/^\/api\/v1\/media\/[^/]+\/url$/.test(p))
      return this.json(route, { url: '/design-system/samples/cabin.svg' });
    return this.json(
      route,
      { error: { code: 'not_found', message: 'Not found', requestId: 'e2e' } },
      404,
    );
  }

  private patch(route: Route, b: Record<string, unknown>) {
    const section = b.section as BuilderSection;
    const keys = SECTION_CONTENT_KEYS[section];
    const mask = Object.fromEntries(keys.map((k) => [k, true as const]));
    const parsed = ListingDraftSchema.pick(mask as never)
      .strict()
      .safeParse(b.data ?? {});
    if (!parsed.success) {
      this.contractErrors.push(
        `patch ${section}: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`,
      );
      return this.json(
        route,
        { error: { code: 'bad_request', message: 'Invalid', requestId: 'e2e' } },
        400,
      );
    }
    const l = this.listing;
    const data = parsed.data as Record<string, unknown>;
    l.draft = { ...l.draft, ...data };
    l.versions = { ...l.versions, [section]: (l.versions[section] ?? 0) + 1 };
    l.draftVersion += 1;
    this.patches.push({ section, data });
    return this.json(route, {
      draftVersion: l.draftVersion,
      sectionVersions: l.versions,
      checklist: [],
    });
  }
}

function builderDraft(
  h2b: Record<string, unknown> | undefined,
  visa = 'h2b',
): Record<string, unknown> {
  const draft = sampleDraft() as Record<string, unknown>;
  const job: Record<string, unknown> = {
    ...(draft.job as Record<string, unknown>),
    visaSponsorship: visa,
  };
  if (h2b) job.h2b = h2b;
  else delete job.h2b;
  return { ...draft, job };
}

/** The builder step on screen (on a phone the other steps are in the page but hidden). */
const here = (page: Page) => page.locator('section[id^="section-"]:visible').first();
const group = (page: Page) => page.getByRole('group', { name: 'Your H-2B job order' });

async function openBuilder(
  page: Page,
  fake: FakeHost,
  width: number,
  height: number,
  theme: 'light' | 'dark' = 'light',
) {
  await fake.install(page);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height });
  const res = await page.goto(`/host/listings/preview/${SAMPLE_IDS.listing}?step=job`, NAVIGATION);
  expect(res?.status()).toBe(200);
  await expect(page.locator('#section-job h2').first()).toBeVisible(NAVIGATION);
}

async function chooseVisa(page: Page, option: string) {
  await here(page)
    .getByRole('combobox', { name: /Visa sponsorship/ })
    .click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Autosave waits for a pause in typing. */
const SAVED = { timeout: 20_000 };

test.describe('the builder Job step (01 Host, H-2B fields)', () => {
  test.describe.configure({ timeout: 180_000 });
  test.skip(({ isMobile }) => isMobile, 'Chromium desktop sets each width itself');

  test('390: the H-2B group under the visa choice, filled in (215:23547)', async ({ page }) => {
    const fake = new FakeHost(builderDraft(BUILDER_TERMS));
    await openBuilder(page, fake, 390, 844);
    const g = group(page);
    await expect(g).toBeVisible();
    await expect(g.getByRole('heading', { level: 3, name: 'Your H-2B job order' })).toBeVisible();
    await expect(
      g.getByText(
        'Copy these from your job order. Guests see them in an H-2B section on your listing. Each one is optional.',
      ),
    ).toBeVisible();
    await expect(g.getByText('Match your job order')).toBeVisible();
    await expect(
      g.getByText(
        'Pay and terms here must be at least as good as your H-2B job order. You confirm this when you publish.',
      ),
    ).toBeVisible();
    const rule = g.getByRole('link', { name: /Read the rule/ });
    await expect(rule).toHaveAttribute('href', RULE);
    await expect(rule).toHaveAttribute('target', '_blank');
    expect((await rule.boundingBox())?.height).toBeGreaterThanOrEqual(44);

    // The group sits right under the visa choice, and each field is labelled, optional (no star)
    // and keeps the whole of a long answer (no maxLength).
    const order = await here(page).evaluate((s) => {
      const visa = s.querySelector('#f-job-visaSponsorship');
      const box = s.querySelector('[role="group"]');
      return (
        !!visa && !!box && !!(visa.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    });
    expect(order).toBe(true);
    for (const [i, label] of LABELS.entries()) {
      const field = g.getByLabel(label, { exact: true });
      await expect(field).toBeVisible();
      await expect(field).not.toHaveAttribute('maxlength', /.*/);
      await expect(field).not.toHaveAttribute('required', /.*/);
      await expect(field).toHaveValue(Object.values(BUILDER_TERMS)[i] ?? '');
      expect((await field.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
    await expect(g.getByText('Optional. As it appears on your job order.')).toBeVisible();
    await check(page, 'builder-job-h2b-390', { fullPage: true });
    expect(fake.contractErrors).toEqual([]);
  });

  test('390: just chose H-2B, nothing typed yet (215:23710)', async ({ page }) => {
    const fake = new FakeHost(builderDraft(undefined, 'none'));
    await openBuilder(page, fake, 390, 844);
    // Any other visa: the approved Job step (43:12041), nothing H-2B.
    await expect(group(page)).toHaveCount(0);
    await expect(page.getByText('Match your job order')).toHaveCount(0);
    await check(page, 'builder-job-not-h2b-390', { fullPage: true });

    await chooseVisa(page, 'H-2B');
    await expect(group(page)).toBeVisible();
    for (const label of LABELS)
      await expect(group(page).getByLabel(label, { exact: true })).toHaveValue('');
    await check(page, 'builder-job-h2b-empty-390', { fullPage: true });
    expect(fake.contractErrors).toEqual([]);
  });

  test('390: a pasted job order line over 60 characters is kept whole, with the error (215:23897)', async ({
    page,
  }) => {
    const fake = new FakeHost(builderDraft(BUILDER_TERMS));
    await openBuilder(page, fake, 390, 844);
    const number = group(page).getByLabel('Job order number', { exact: true });
    await number.fill(PASTED);
    await number.blur();
    await expect(number).toHaveValue(PASTED);
    await expect(number).toHaveAttribute('aria-invalid', 'true');
    const message =
      'Use 60 characters or fewer. This has 74. Enter just the number, like MT 4417260.';
    await expect(group(page).getByText(message)).toBeVisible();
    await expect(number).toHaveAccessibleDescription(new RegExp(message.replaceAll('.', '\\.')));
    await expect(
      here(page).getByText('Fix the job order number before you publish.'),
    ).toBeVisible();

    // Next keeps the host on the step, on the field to fix.
    await here(page).getByRole('button', { name: 'Next' }).click();
    await expect(number).toBeFocused();
    await expect(page).toHaveURL(/step=job/);
    // The whole paste is saved with the draft.
    await expect
      .poll(
        () =>
          fake.patches.some(
            (p) =>
              (p.data.job as { h2b?: { jobOrderNumber?: string } } | undefined)?.h2b
                ?.jobOrderNumber === PASTED,
          ),
        SAVED,
      )
      .toBe(true);
    await check(page, 'builder-job-h2b-error-390', { fullPage: true });
    expect(fake.contractErrors).toEqual([]);
  });

  test('switching away from H-2B hides the group and keeps the answers', async ({ page }) => {
    const fake = new FakeHost(builderDraft(BUILDER_TERMS));
    await openBuilder(page, fake, 390, 844);
    await chooseVisa(page, 'Not available');
    await expect(group(page)).toHaveCount(0);
    await expect
      .poll(() => {
        const job = fake.listing.draft.job as { visaSponsorship?: string; h2b?: unknown };
        return (
          job.visaSponsorship === 'none' &&
          JSON.stringify(job.h2b) === JSON.stringify(BUILDER_TERMS)
        );
      }, SAVED)
      .toBe(true);
    await chooseVisa(page, 'H-2B');
    await expect(group(page).getByLabel('Job order number', { exact: true })).toHaveValue(
      'MT 4417260',
    );
    expect(fake.contractErrors).toEqual([]);
  });

  test('768: the tablet workspace, section 7 (217:24023)', async ({ page }) => {
    const fake = new FakeHost(builderDraft(BUILDER_TERMS));
    await openBuilder(page, fake, 768, 1024);
    await expect(group(page)).toBeVisible();
    await check(page, 'builder-job-h2b-768', { show: page.locator('#section-job') });
    await check(page, 'builder-job-h2b-group-768', { show: group(page) });
  });

  test('1440: the workspace with What guests see (217:24484), and the error (217:25079)', async ({
    page,
  }) => {
    const fake = new FakeHost(builderDraft(BUILDER_TERMS));
    await openBuilder(page, fake, 1440, 900);
    await expect(group(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What guests see' })).toBeVisible();
    await check(page, 'builder-job-h2b-1440', { show: page.locator('#section-job') });
    await check(page, 'builder-job-h2b-group-1440', { show: group(page) });

    const number = group(page).getByLabel('Job order number', { exact: true });
    await number.fill(PASTED);
    await number.blur();
    await expect(page.getByText('Fix the job order number before you publish.')).toBeVisible();
    await check(page, 'builder-job-h2b-error-1440', {
      show: group(page).getByText('Your H-2B job order'),
    });
    expect(fake.contractErrors).toEqual([]);
  });

  test('390 dark: the group uses the same tokens', async ({ page }) => {
    const fake = new FakeHost(builderDraft(BUILDER_TERMS));
    await openBuilder(page, fake, 390, 844, 'dark');
    await check(page, 'builder-job-h2b-390-dark', { show: group(page) });
  });
});

// --- The guest listing detail (02 Seeker) -----------------------------------------------------

type Ref = { id: string; slug: string };
type Seeded = { terms: Ref; none: Ref; media: Map<string, string> };

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

/** The guest frames' terms (223:20363): Kettle Ridge Lodge's 141-day job, 12-week periods. */
const GUEST_TERMS = {
  transportation:
    'We repay your fare here and meals on the way once you finish half the season. We pay your trip home when you finish or if we end the job early.',
  tools: 'Uniforms, cleaning supplies and carts, at no charge.',
  threeFourthsGuarantee:
    'We offer at least three-fourths of the job order hours in each 12-week period. If we offer fewer, we pay what you would have earned.',
  swaContact: 'Kalispell Job Service · (406) 555-0187',
  jobOrderNumber: 'MT 4419025',
};

/** The page 02 sample, Lodge housekeeper at Kettle Ridge Lodge, as flow A seeds it. */
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
 * The seeding script, run with tsx as flow A does (the SP2 write helpers import `next/server`
 * without an extension, which Playwright's loader can't resolve). It prints the seeded ids.
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
  throw new Error('h2b e2e: refusing to seed a database that is not on localhost');
}
const { resetEnvCache } = await import(at('src/lib/env.ts'));
resetEnvCache();
const { getDb, closeDb, queryRows } = await import(at('src/lib/db.ts'));
const { sql } = await import('drizzle-orm');
const writes = await import(at('tests/e2e/fixtures/sp2-writes.ts'));
const lodgeHousekeeper = ${lodgeHousekeeper.toString()};
const TERMS = ${JSON.stringify(GUEST_TERMS)};
const db = getDb();

async function ensure(host, title, edit) {
  const existing = await writes.findListingByTitle(db, host.orgId, title);
  if (existing?.state === 'in_review') await writes.drainUntilEmpty(db);
  const again = existing ? await writes.findListingByTitle(db, host.orgId, title) : null;
  if (again?.state === 'active') return writes.listingFixture(db, again.id, title);
  if (again?.state === 'draft') await writes.discardDraft(db, host, again.id);
  const published = await writes.publishListing(db, host, edit);
  return writes.listingFixture(db, published.id, title);
}

const kettle = await writes.seedHost(db, {
  name: 'Kettle Ridge Lodge',
  city: 'Whitefish',
  state: 'MT',
  point: { lat: 48.4106, lng: -114.3528 },
  publicPrecision: 'city',
  timezone: 'America/Denver',
});
const terms = await ensure(kettle, 'Lodge housekeeper', (c) => {
  lodgeHousekeeper(c);
  c.job.visaSponsorship = 'h2b';
  c.job.h2b = TERMS;
});
const none = await ensure(kettle, 'Lodge laundry lead', (c) => {
  lodgeHousekeeper(c);
  c.basics.title = 'Lodge laundry lead';
  c.job.visaSponsorship = 'h2b';
  c.job.h2b = null;
});
await writes.drainUntilEmpty(db);
const rows = await queryRows(db, sql\`
  select l.id, r.content from app.listings l
  join app.listing_revisions r on r.id = l.published_revision_id
  where l.id in (\${terms.id}::uuid, \${none.id}::uuid)
\`);
const photos = rows.map((r) => ({
  cover: r.content.photos.coverMediaId,
  housing: r.content.housing.provided ? Object.values(r.content.housing.photos) : [],
  meals: r.content.meals.provided ? Object.values(r.content.meals.photos) : [],
}));
console.log('H2B_SEED ' + JSON.stringify({ terms, none, photos }));
await Promise.race([closeDb(), new Promise((resolve) => setTimeout(resolve, 5000))]);
process.exit(0);
`;
}

function seed(): Seeded {
  const dir = path.join(ROOT, '.data', 'e2e');
  mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'h2b-fields-seed.mts');
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
  const line = out.split(/\r?\n/).find((l) => l.startsWith('H2B_SEED '));
  if (!line) throw new Error('h2b e2e: the seed printed no result');
  const r = JSON.parse(line.slice('H2B_SEED '.length)) as {
    terms: Ref;
    none: Ref;
    photos: { cover: string; housing: string[]; meals: string[] }[];
  };
  const media = new Map<string, string>();
  for (const p of r.photos) {
    media.set(p.cover, 'lake.svg');
    p.housing.forEach((id, i) => media.set(id, HOUSING_SAMPLES[i] ?? 'cabin.svg'));
    p.meals.forEach((id, i) => media.set(id, MEAL_SAMPLES[i] ?? 'kitchen.svg'));
  }
  return { terms: r.terms, none: r.none, media };
}

let seeded: Seeded;
const listingPath = (r: Ref) => `/jobs/view/${r.id}/${r.slug}`;

async function openDetail(
  page: Page,
  width: number,
  height: number,
  ref: Ref,
  theme: 'light' | 'dark' = 'light',
) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height });
  await page.route(/\.webp(\?|$)/, async (route) => {
    const url = route.request().url();
    const id = [...seeded.media.keys()].find((k) => url.includes(k));
    const file = path.join(SAMPLES, (id && seeded.media.get(id)) || 'kettle-ridge-logo.svg');
    await route.fulfill({ contentType: 'image/svg+xml', body: readFileSync(file) });
  });
  const res = await page.goto(listingPath(ref), NAVIGATION);
  expect(res?.status()).toBe(200);
}

const terms = (page: Page) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'H-2B job terms' }) });

test.describe('the guest listing detail (02 Seeker, H-2B fields)', () => {
  test.describe.configure({ timeout: 180_000 });
  test.skip(({ isMobile }) => isMobile, 'Chromium desktop sets each width itself');

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    seeded = seed();
  });

  test('390: the H-2B job terms after Perks, in the employer’s words (223:20363)', async ({
    page,
  }) => {
    await openDetail(page, 390, 844, seeded.terms);
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
    const perks = headings.indexOf('Perks');
    expect(perks).toBeGreaterThan(-1);
    expect(headings[perks + 1]).toBe('H-2B job terms');
    const s = terms(page);
    await expect(
      s.getByText(
        'Kettle Ridge Lodge also hires through the H-2B visa program. It gave us these terms from its job order.',
      ),
    ).toBeVisible();
    for (const label of [
      'Travel to the job and home',
      'Tools and equipment',
      'Hours guarantee',
      'Apply through the state',
    ]) {
      await expect(s.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(s.getByText(GUEST_TERMS.tools)).toBeVisible();
    await expect(
      s.getByText(
        'You can also apply at the state job office: Kalispell Job Service · (406) 555-0187. Job order MT 4419025.',
      ),
    ).toBeVisible();
    await expect(
      s.getByText(
        'These are the employer’s words. Ask Kettle Ridge Lodge to confirm them in writing before you accept.',
      ),
    ).toBeVisible();
    // The trust line still follows.
    await expect(
      page.getByText('You never pay to get a job. Report any listing that asks you to.'),
    ).toBeVisible();
    await check(page, 'detail-h2b-terms-390', { show: s });
    await check(page, 'detail-h2b-terms-390-full', { fullPage: true });
  });

  test('390: an H-2B listing with no terms added says so in one line (223:20530)', async ({
    page,
  }) => {
    await openDetail(page, 390, 844, seeded.none);
    const s = terms(page);
    await expect(
      s.getByText(
        'Kettle Ridge Lodge also hires through the H-2B visa program. It hasn’t added terms from its job order. Ask it about travel, tools and guaranteed hours before you accept.',
      ),
    ).toBeVisible();
    await expect(s.getByRole('listitem')).toHaveCount(0);
    await check(page, 'detail-h2b-no-terms-390', { show: s });
  });

  test('390 dark (223:20667)', async ({ page }) => {
    await openDetail(page, 390, 844, seeded.terms, 'dark');
    await check(page, 'detail-h2b-terms-390-dark', { show: terms(page) });
  });

  test('768 (223:20796)', async ({ page }) => {
    await openDetail(page, 768, 1024, seeded.terms);
    await check(page, 'detail-h2b-terms-768', { show: terms(page) });
  });

  test('1440 side panel, scrolled to the H-2B job terms (223:20970)', async ({ page }) => {
    await openDetail(page, 1440, 900, seeded.terms);
    await expect(terms(page)).toBeVisible();
    await check(page, 'detail-h2b-terms-1440', { show: terms(page) });
  });
});
