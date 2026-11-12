// Flow C, a host publishes a first listing (issue #111; Figma 01 Host, section C), at 390, 768 and
// 1440 px: Listings empty -> Start -> the 10 builder steps with phone camera capture -> Review ->
// "is in review" (never "live"), plus the states: inline validation that keeps what was typed,
// autosave, offline, a failed upload, the camera unavailable, loading, error and a failed publish.
// Every screen passes axe at the serious and critical levels and matches its screenshot.
//
// It drives the development-only preview route (src/app/host/listings/preview), which renders
// the real screens in the host shell without a signed-in host: a keyless Clerk development
// instance has Organizations turned off, so it can't sign a host in (tests/e2e/shells.spec.ts).
// The host API is answered here by a fake that holds to the real contract: each autosave body
// must pass the server's strict section schema (ListingDraftSchema), and Publish only succeeds
// for a draft that passes ListingContentSchema.
//
// Run it (no database needed; Clerk runs keyless):
//   PORT=3071 pnpm e2e tests/e2e/flow-c-first-listing.spec.ts --project chromium
// The first run writes missing baselines and fails; run it again to compare. After an intended
// visual change: add --update-snapshots. Baselines are rendered on Windows.
//
// Screenshots: tests/e2e/__screenshots__/flow-c-first-listing.spec.ts/flow-c-<screen>-<width>.png
import { crc32, deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type { BuilderSection } from '@/modules/listings';
// The listings module's index loads the whole module (jobs, then next/server), which Node can't
// import in the Playwright runner. These two files are the listing contract alone (zod and the
// plain lists in src/lib), so the fake API checks against the real schemas.
// eslint-disable-next-line no-restricted-imports -- see above
import { checklist } from '@/modules/listings/checklist';
// eslint-disable-next-line no-restricted-imports -- see above
import {
  ListingContentSchema,
  ListingDraftSchema,
  SECTION_CONTENT_KEYS,
} from '@/modules/listings/content';
import {
  SAMPLE_IDS,
  SAMPLE_LOCATIONS,
  SAMPLE_TEAM,
  sampleDraft,
} from '@/app/host/listings/_lib/sample';

const BASE = '/host/listings/preview';
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1440, height: 900 };
const NAVIGATION = { timeout: 60_000 };
const screenshot = { animations: 'disabled', maxDiffPixelRatio: 0.01, timeout: 30_000 } as const;

// --- A photo to upload: a small PNG made here, so the test needs no files. -------------------

function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      // A soft vertical gradient, so the photo reads as a picture, not a flat block.
      const shade = 0.75 + (0.25 * y) / height;
      rows.set(
        rgb.map((c) => Math.round(c * shade)),
        row + 1 + x * 3,
      );
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const photo = (name: string, rgb: [number, number, number]) => ({
  name: `${name}.png`,
  mimeType: 'image/png',
  buffer: png(320, 240, rgb),
});

// --- The fake host API ------------------------------------------------------------------------

type FakeListing = {
  id: string;
  draft: Record<string, unknown>;
  versions: Partial<Record<BuilderSection, number>>;
  draftVersion: number;
  state: 'draft' | 'in_review' | 'active';
  reviewStage: string | null;
  firstPublishedAt: string | null;
  updatedAt: string;
};

let counter = 0;
const newId = () => `0193b000-0000-7000-8000-${String(++counter).padStart(12, '0')}`;

class FakeHost {
  listings = new Map<string, FakeListing>();
  media = new Set<string>();
  /** Problems the fake found in what the browser sent; the test asserts there are none. */
  contractErrors: string[] = [];
  patches: { section: BuilderSection; data: unknown }[] = [];
  published: unknown[] = [];
  failNextPut = false;
  failList = false;
  failPublishOnce = false;
  offline = false;
  listDelayMs = 0;

  seed(draft: Record<string, unknown>): string {
    const id = SAMPLE_IDS.listing;
    this.listings.set(id, {
      id,
      draft,
      versions: {
        basics: 1,
        where_when: 1,
        pay: 1,
        housing: 1,
        meals: 1,
        genre_details: 1,
        job: 1,
        photos: 1,
        applying: 1,
      },
      draftVersion: 9,
      state: 'draft',
      reviewStage: null,
      firstPublishedAt: null,
      updatedAt: new Date(2027, 0, 5, 18, 14).toISOString(),
    });
    return id;
  }

  editor(l: FakeListing) {
    const title = (l.draft.basics as { title?: string } | undefined)?.title ?? null;
    return {
      listing: {
        id: l.id,
        state: l.state,
        reviewStage: l.reviewStage,
        provenance: 'host_created',
        title,
        locationId: SAMPLE_IDS.location,
        copiedFromId: null,
        repostedFromId: null,
        firstPublishedAt: l.firstPublishedAt,
        publishedAt: null,
        confirmedActiveAt: null,
        autoCloseAt: null,
        closedAt: null,
        closeReason: null,
        removedAt: null,
        createdAt: l.updatedAt,
        updatedAt: l.updatedAt,
      },
      draft: l.draft,
      draftVersion: l.draftVersion,
      sectionVersions: l.versions,
      live: null,
      pending: null,
      checklist: checklist(l.draft),
      aiFilledFields: [],
    };
  }

  row(l: FakeListing) {
    const e = this.editor(l).listing;
    return { ...e, hasUnpublishedChanges: false, stats: null, badge: null };
  }

  async install(page: Page): Promise<void> {
    // A request the page dropped (a reload, a navigation) can't be answered; that is fine.
    await page.route(/\/__e2e\/upload\//, (route) => this.upload(route).catch(() => undefined));
    await page.route(/\/api\/v1\//, (route) => this.api(route).catch(() => undefined));
  }

  private async upload(route: Route) {
    if (this.offline) return route.abort('internetdisconnected');
    if (this.failNextPut) {
      this.failNextPut = false;
      return route.fulfill({ status: 500, body: 'storage error' });
    }
    return route.fulfill({ status: 200, body: '' });
  }

  private json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  }

  private error(route: Route, status: number, code: string, message: string, details?: unknown) {
    return this.json(route, { error: { code, message, details, requestId: 'e2e' } }, status);
  }

  private async api(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = (): Record<string, unknown> =>
      req.postData() ? (JSON.parse(req.postData() ?? '{}') as Record<string, unknown>) : {};

    // The shell's live counts: no stream here, and nothing unread.
    if (path === '/api/v1/me/stream') return route.fulfill({ status: 204 });
    if (path === '/api/v1/notifications')
      return this.json(route, { items: [], unread: 0, nextCursor: null });
    if (this.offline) return route.abort('internetdisconnected');

    if (path === '/api/v1/host/listings' && method === 'GET') {
      if (this.listDelayMs) await new Promise((r) => setTimeout(r, this.listDelayMs));
      if (this.failList) return this.error(route, 500, 'internal', 'Internal error');
      const tab = url.searchParams.get('tab');
      const all = [...this.listings.values()];
      const items = all.filter((l) =>
        tab === 'active'
          ? l.state !== 'draft'
          : tab === 'drafts'
            ? l.state === 'draft' && !l.firstPublishedAt
            : !!l.firstPublishedAt,
      );
      return this.json(route, {
        items: items.map((l) => this.row(l)),
        nextBefore: null,
        slots: { used: all.filter((l) => l.state !== 'draft').length, limit: 10 },
      });
    }
    if (path === '/api/v1/host/listings' && method === 'POST') {
      const id = newId();
      this.listings.set(id, {
        id,
        draft: {},
        versions: {},
        draftVersion: 0,
        state: 'draft',
        reviewStage: null,
        firstPublishedAt: null,
        updatedAt: new Date().toISOString(),
      });
      return this.json(route, { id, openSection: 'basics' });
    }

    const m = /^\/api\/v1\/host\/listings\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (m) {
      const listing = this.listings.get(m[1] ?? '');
      if (!listing) return this.error(route, 404, 'not_found', 'Not found');
      const action = m[2];
      if (!action && method === 'GET') return this.json(route, this.editor(listing));
      if (action === 'draft' && method === 'PATCH') return this.patch(route, listing, body());
      if (action === 'checks') {
        const parsed = ListingContentSchema.safeParse(listing.draft);
        const errors = parsed.success
          ? []
          : parsed.error.issues.map((i) => {
              const field = i.path.filter((p) => typeof p === 'string').join('.');
              const key = field.split('.')[0] ?? '';
              const section = (Object.entries(SECTION_CONTENT_KEYS).find(([, keys]) =>
                (keys as string[]).includes(key),
              )?.[0] ?? 'basics') as BuilderSection;
              return { code: 'required_missing', section, field, message: 'This is required.' };
            });
        return this.json(route, { errors, warnings: [], slot: { used: 0, limit: 10 } });
      }
      if (action === 'publish') {
        if (this.failPublishOnce) {
          this.failPublishOnce = false;
          return route.abort('internetdisconnected');
        }
        const parsed = ListingContentSchema.safeParse(listing.draft);
        if (!parsed.success) {
          this.contractErrors.push(`publish: ${JSON.stringify(parsed.error.issues.slice(0, 5))}`);
          return this.error(route, 400, 'bad_request', 'Fix these before you publish.', {
            issues: [],
          });
        }
        this.published.push(parsed.data);
        listing.state = 'in_review';
        listing.reviewStage = 'verification';
        listing.firstPublishedAt = new Date().toISOString();
        return this.json(route, { state: 'in_review', reviewStage: 'verification' });
      }
      if (action === 'ai/description') {
        return this.json(route, {
          description:
            'Clean and turn over guest cabins with a team of four, restock linens and keep the lodge ready for 3 PM arrivals.',
        });
      }
    }

    if (path === '/api/v1/host/locations' && method === 'GET') {
      return this.json(
        route,
        SAMPLE_LOCATIONS.map((l) => ({ ...l, archived: false })),
      );
    }
    if (path === '/api/v1/host/team') {
      return this.json(route, {
        members: SAMPLE_TEAM.map((t) => ({ ...t, role: 'owner' })),
        seats: { used: 3, limit: 5 },
      });
    }
    if (path === '/api/v1/media/uploads' && method === 'POST') {
      const id = newId();
      this.media.add(id);
      return this.json(route, { mediaId: id, uploadUrl: `/__e2e/upload/${id}`, token: 't' });
    }
    if (/^\/api\/v1\/media\/uploads\/[^/]+\/complete$/.test(path))
      return route.fulfill({ status: 204 });
    if (/^\/api\/v1\/media\/[^/]+\/url$/.test(path)) {
      // Seeded photos: the sample illustrations. A new upload is still being checked.
      const id = path.split('/')[4] ?? '';
      const i = (SAMPLE_IDS.media as readonly string[]).indexOf(id);
      if (i < 0) return this.error(route, 404, 'not_found', 'Not found');
      const art =
        [
          'cabin',
          'lake',
          'bedroom',
          'bedroom',
          'kitchen',
          'cabin',
          'kitchen',
          'farm',
          'kitchen',
          'harbor',
        ][i] ?? 'lake';
      return this.json(route, { url: `/design-system/samples/${art}.svg` });
    }
    return this.error(route, 404, 'not_found', `No fake for ${method} ${path}`);
  }

  private patch(route: Route, l: FakeListing, b: Record<string, unknown>) {
    const section = b.section as BuilderSection;
    const keys = SECTION_CONTENT_KEYS[section];
    if (!keys) {
      this.contractErrors.push(`patch: unknown section ${String(section)}`);
      return this.error(route, 400, 'bad_request', 'Invalid section');
    }
    const mask = Object.fromEntries(keys.map((k) => [k, true as const]));
    const parsed = ListingDraftSchema.pick(mask as never)
      .strict()
      .safeParse(b.data ?? {});
    if (!parsed.success) {
      this.contractErrors.push(
        `patch ${section}: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`,
      );
      return this.error(route, 400, 'bad_request', 'Invalid section data', parsed.error.issues);
    }
    const current = l.versions[section] ?? 0;
    if (b.baseVersion !== current) {
      return this.error(route, 409, 'conflict', 'Someone else changed this section', {
        reason: 'section_conflict',
        section,
        version: current,
        data: {},
      });
    }
    const data = parsed.data as Record<string, unknown>;
    l.draft = Object.fromEntries(
      [
        ...Object.entries(l.draft).filter(([k]) => !(keys as string[]).includes(k)),
        ...Object.entries(data),
      ].filter(([, v]) => v !== undefined),
    );
    l.versions = { ...l.versions, [section]: current + 1 };
    l.draftVersion += 1;
    l.updatedAt = new Date().toISOString();
    this.patches.push({ section, data });
    return this.json(route, {
      draftVersion: l.draftVersion,
      sectionVersions: l.versions,
      checklist: checklist(l.draft),
    });
  }
}

// --- Helpers ----------------------------------------------------------------------------------

/** Every tap and click the host makes, for the tap count. Typing is not counted. */
let taps = 0;
async function tap(_page: Page, locator: Locator) {
  taps += 1;
  await locator.click();
}

async function seriousA11yIssues(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).exclude('nextjs-portal').analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** Hides development overlays (the Next.js indicator, Clerk's keyless prompt) and waits for images. */
async function settle(page: Page) {
  await page.addStyleTag({
    content:
      'nextjs-portal, [data-clerk-keyless-prompt], .cl-keylessPrompt, [class*="keyless"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    // Scroll through the page so every lazy image (loading="lazy") is requested, as the
    // design-system spec does, then back to the top for the screenshot.
    const pause = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await pause();
    }
    window.scrollTo(0, 0);
    const shown = Array.from(document.images).filter((img) => img.getClientRects().length > 0);
    await Promise.all(
      shown.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            }),
      ),
    );
    await document.fonts.ready;
  });
}

/** axe-clean, then the screenshot. */
async function check(page: Page, name: string, opts: { fullPage?: boolean; show?: Locator } = {}) {
  await settle(page);
  // A viewport screenshot of something below the top: bring it into view first.
  if (opts.show) await opts.show.scrollIntoViewIfNeeded();
  expect(await seriousA11yIssues(page), `axe on ${name}`).toEqual([]);
  if (!(opts.fullPage ?? true)) {
    await expect(page).toHaveScreenshot(`flow-c-${name}.png`, screenshot);
    return;
  }
  // The whole page, taken by making the viewport as tall as the page: a full-page capture would
  // draw the fixed top bar and bottom tabs where the viewport happened to be, over the content.
  const size = page.viewportSize();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (size && height > size.height) await page.setViewportSize({ width: size.width, height });
  await expect(page).toHaveScreenshot(`flow-c-${name}.png`, screenshot);
  if (size) await page.setViewportSize(size);
}

/** The builder step on screen (on a phone the other steps are in the page but hidden). */
function here(page: Page): Locator {
  return page.locator('section[id^="section-"]:visible');
}

async function choose(page: Page, label: string | RegExp, option: string) {
  await tap(page, here(page).getByRole('combobox', { name: label }));
  await tap(page, page.getByRole('option', { name: option, exact: true }));
}

async function next(page: Page, heading: string | RegExp) {
  await tap(page, here(page).getByRole('button', { name: 'Next' }));
  await expect(here(page).getByRole('heading', { level: 2, name: heading })).toBeVisible();
}

/** Takes a photo with the phone camera: the slot opens the camera, then "Use this photo". */
async function takePhoto(page: Page, slot: RegExp, file: ReturnType<typeof photo>, shot?: string) {
  const chooser = page.waitForEvent('filechooser');
  await tap(page, here(page).getByRole('button', { name: slot }));
  await (await chooser).setFiles(file);
  await expect(page.getByRole('button', { name: 'Use this photo' })).toBeVisible();
  if (shot) await check(page, shot);
  await tap(page, page.getByRole('button', { name: 'Use this photo' }));
}

async function open(page: Page, path: string, theme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  const res = await page.goto(path, NAVIGATION);
  expect(res?.status(), `${path} status`).toBe(200);
}

test.describe('Flow C: a host publishes a first listing', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
  test.skip(
    ({ isMobile, browserName }) => isMobile || browserName !== 'chromium',
    'Chromium desktop sets each width itself',
  );

  test('on a phone (390): empty listings to "in review", with camera capture', async ({ page }) => {
    const fake = new FakeHost();
    await fake.install(page);
    await page.setViewportSize(PHONE);
    taps = 0;

    await open(page, BASE);
    await expect(page.getByRole('heading', { name: 'No listings yet' })).toBeVisible(NAVIGATION);
    await check(page, 'listings-empty-390');

    await tap(page, page.getByRole('link', { name: 'New listing' }));
    await expect(page.getByRole('heading', { name: 'Start a listing' })).toBeVisible(NAVIGATION);
    await check(page, 'start-390');

    await tap(page, page.getByRole('button', { name: 'Start blank' }));
    await expect(here(page).getByRole('heading', { level: 2, name: 'Basics' })).toBeVisible(
      NAVIGATION,
    );

    // 1 Basics: Next checks the step and keeps what was typed.
    await here(page).getByLabel('Job title').fill('Hk');
    await tap(page, here(page).getByRole('button', { name: 'Next' }));
    await expect(here(page).getByText('Add a job title of 5 to 80 characters.')).toBeVisible();
    await expect(here(page).getByLabel('Job title')).toHaveValue('Hk');
    await here(page).getByLabel('Job title').fill('Housekeeper');
    await choose(page, /^Category/, 'Seasonal');
    await choose(page, /^Genre/, 'Guest ranches and lodges');
    await choose(page, /^Occupation/, 'Housekeeper');
    await here(page)
      .getByLabel(/^Openings/)
      .fill('3');
    await tap(page, here(page).getByText('Employee', { exact: true }));
    await tap(page, here(page).getByText('Full time', { exact: true }));
    await check(page, 'step-1-basics-390');
    await next(page, 'Where and when');

    // 2 Where and when
    await choose(page, /^Location/, 'West Yellowstone, MT');
    await tap(page, here(page).getByText('Fixed dates', { exact: true }));
    await here(page)
      .getByLabel(/^First day/)
      .fill('2027-05-18');
    await here(page)
      .getByLabel(/^Last day/)
      .fill('2027-09-12');
    await here(page)
      .getByLabel(/^Hours a week/)
      .fill('40');
    await choose(page, 'Minimum commitment', 'The whole season');
    await check(page, 'step-2-where-when-390');
    await next(page, 'Pay');

    // 3 Pay: an unreadable amount stays on screen with its error.
    const amount = here(page).getByLabel(/^Amount/);
    await amount.fill('Good wages');
    await amount.blur();
    // The field's own error. The Review step lists it too, as a link back here (checked in the
    // workspace test).
    await expect(page.locator('#f-pay-amount-error')).toHaveText(
      'Add a number, like 18, or a range like 18 to 22.',
    );
    await expect(amount).toHaveValue('Good wages');
    await check(page, 'pay-error-390', { fullPage: false });
    await amount.fill('$18–$20');
    await choose(page, /^Per/, 'An hour');
    await choose(page, /^How often you pay/, 'Every two weeks');
    await tap(page, here(page).getByRole('switch', { name: 'Overtime is paid' }));
    await tap(page, here(page).getByText('Paid time off', { exact: true }));
    await tap(page, here(page).getByText('Bonuses', { exact: true }));
    await here(page)
      .getByLabel('Tell guests about the bonus')
      .fill('A $500 bonus if you stay to Sep 12.');
    await check(page, 'step-3-pay-390');
    await next(page, 'Housing');

    // 4 Housing, with the phone camera, a failed upload and the camera unavailable.
    await tap(page, here(page).getByRole('switch', { name: 'Housing is provided' }));
    await tap(page, here(page).getByText('Shared room', { exact: true }));
    await tap(page, here(page).getByText('An amount', { exact: true }));
    await here(page)
      .getByLabel(/^Amount/)
      .fill('$110');
    await choose(page, /^Per/, 'A week');
    await tap(page, here(page).getByText('Taken from pay', { exact: true }));
    await tap(page, here(page).getByText('Couples can share one room', { exact: true }));
    await here(page)
      .getByLabel('Short note for the card')
      .fill('2 per room, 5 minutes from the lodge');
    await takePhoto(page, /^Bedroom Take photo/, photo('bedroom', [196, 170, 140]), 'camera-390');
    // Only once the bedroom upload has finished, so the failure lands on the bathroom photo.
    await expect(here(page).getByRole('button', { name: /Bedroom photo added/ })).toBeVisible();
    fake.failNextPut = true;
    await takePhoto(page, /^Bathroom Take photo/, photo('bathroom', [150, 186, 196]));
    await expect(page.getByText('1 photo didn’t upload')).toBeVisible();
    await check(page, 'photo-failed-390', {
      fullPage: false,
      show: here(page).getByText('1 photo didn’t upload'),
    });
    await tap(page, here(page).getByRole('button', { name: /Bathroom didn’t upload/ }));
    await expect(page.getByRole('button', { name: /Bathroom photo added/ })).toBeVisible();
    // The camera closes without a photo: offer the host's own photos. The test takes the file
    // chooser so none is left open, then closes it the way the browser does, with `cancel`.
    const camera = page.waitForEvent('filechooser');
    await tap(page, here(page).getByRole('button', { name: /^Kitchen Take photo/ }));
    await camera;
    await page.getByTestId('photo-camera-input').dispatchEvent('cancel');
    await expect(page.getByRole('heading', { name: 'We can’t use your camera' })).toBeVisible();
    await check(page, 'camera-blocked-390');
    const library = page.waitForEvent('filechooser');
    await tap(page, page.getByRole('button', { name: 'Choose from your photos' }));
    await (await library).setFiles(photo('kitchen', [120, 150, 120]));
    await tap(page, page.getByRole('button', { name: 'Use this photo' }));
    await takePhoto(page, /^Exterior Take photo/, photo('exterior', [110, 140, 170]));
    for (const slot of ['Bedroom', 'Bathroom', 'Kitchen', 'Exterior']) {
      await expect(
        here(page).getByRole('button', { name: new RegExp(`^${slot} photo added`) }),
      ).toBeVisible();
    }
    await check(page, 'step-4-housing-390');
    await next(page, 'Meals');

    // 5 Meals
    await tap(page, here(page).getByRole('switch', { name: 'Meals are provided' }));
    await here(page)
      .getByLabel(/^Meals a day/)
      .fill('3');
    await tap(page, here(page).getByText('Work days', { exact: true }));
    await tap(page, here(page).getByText('An amount', { exact: true }));
    await here(page)
      .getByLabel(/^Amount/)
      .fill('$50');
    await choose(page, /^Per/, 'A week');
    await tap(page, here(page).getByText('Taken from pay', { exact: true }));
    await takePhoto(page, /^Kitchen Take photo/, photo('meal-kitchen', [130, 160, 130]));
    await takePhoto(page, /^Meal example Take photo/, photo('meal', [220, 190, 120]));
    await takePhoto(page, /^Dining area Take photo/, photo('dining', [200, 180, 150]));
    await takePhoto(page, /^Other Take photo/, photo('other', [170, 170, 190]));
    for (const slot of ['Kitchen', 'Meal example', 'Dining area', 'Other']) {
      await expect(
        here(page).getByRole('button', { name: new RegExp(`^${slot} photo added`) }),
      ).toBeVisible();
    }
    await check(page, 'step-5-meals-390');
    await next(page, 'Seasonal details');

    // 6 Seasonal details
    await choose(page, 'Destination', 'Yellowstone National Park');
    await tap(page, here(page).getByText('Free park pass', { exact: true }));
    await tap(page, here(page).getByText('Shuttle to town', { exact: true }));
    await check(page, 'step-6-seasonal-390');
    await next(page, 'The job');

    // 7 The job
    await here(page)
      .getByLabel(/^Description/)
      .fill(
        'Clean and turn over 14 guest cabins a day with a team of four. Restock linens, report repairs, and keep the lodge ready for arrivals at 3 PM.',
      );
    await here(page)
      .getByLabel(/^Required qualifications/)
      .fill('One season of housekeeping or hotel work');
    await here(page)
      .getByLabel(/^Skills/)
      .fill('Housekeeping, laundry, guest service');
    await check(page, 'step-7-job-390');
    await next(page, 'Photos');

    // 8 Photos
    await takePhoto(page, /^Cover Take photo/, photo('cover', [90, 130, 160]));
    await expect(page.getByRole('button', { name: /Cover photo added/ })).toBeVisible();
    await check(page, 'step-8-photos-390');
    await next(page, 'Applying');

    // 9 Applying
    await tap(page, here(page).getByRole('button', { name: 'Add a question' }));
    await here(page)
      .getByLabel(/^Question/)
      .fill('Can you start on May 18, 2027?');
    await check(page, 'step-9-applying-390');
    await next(page, 'Check the card');

    // 10 Review: the checks pass, Publish needs the two checks, then it goes to review.
    await expect(page.getByText('No wording problems found')).toBeVisible(NAVIGATION);
    await check(page, 'step-10-review-390');
    await tap(page, page.getByRole('button', { name: 'Publish listing' }));
    await expect(page.getByText('Check this to publish.').first()).toBeVisible();
    await tap(
      page,
      here(page).getByText(
        'The pay shown is the range we expect, in good faith, to pay for this job.',
      ),
    );
    await tap(
      page,
      here(page).getByText('These hours and deductions are what we expect for this job.'),
    );
    fake.failPublishOnce = true;
    await tap(page, page.getByRole('button', { name: 'Publish listing' }));
    await expect(page.getByRole('heading', { name: 'Couldn’t publish Housekeeper' })).toBeVisible();
    await check(page, 'publish-failed-390');
    await tap(page, page.getByRole('button', { name: 'Try again' }));

    // The ending says "in review", never that the listing is live (the body's "You will get an
    // email when the job is live" is the approved copy).
    const ending = page.getByRole('heading', { name: 'Housekeeper is in review' });
    await expect(ending).toBeVisible(NAVIGATION);
    await expect(ending).not.toContainText('live');
    await check(page, 'in-review-390');
    const publishTaps = taps;

    await tap(page, page.getByRole('link', { name: 'Back to listings' }));
    await expect(page.getByText('In review', { exact: true })).toBeVisible(NAVIGATION);
    await check(page, 'listings-in-review-390');

    expect(fake.contractErrors).toEqual([]);
    expect(fake.published).toHaveLength(1);
    expect(fake.published[0]).toMatchObject({
      basics: { title: 'Housekeeper', primaryCategory: 'seasonal', openings: 3 },
      pay: { kind: 'range', minCents: 1800, maxCents: 2000, unit: 'hour' },
      housing: {
        provided: true,
        cost: { free: false, cents: 11000, period: 'week', paidBy: 'deducted' },
      },
    });
    test
      .info()
      .annotations.push({ type: 'taps', description: `phone, Start to In review: ${publishTaps}` });
  });

  for (const viewport of [DESKTOP, TABLET]) {
    test(`the workspace at ${viewport.width}: the card ${viewport.width === 1440 ? 'beside' : 'under'} the form, then publish`, async ({
      page,
    }) => {
      const fake = new FakeHost();
      await fake.install(page);
      await page.setViewportSize(viewport);
      taps = 0;
      const w = viewport.width;

      await open(page, BASE);
      await expect(page.getByRole('heading', { name: 'No listings yet' })).toBeVisible(NAVIGATION);
      await check(page, `listings-empty-${w}`);
      await tap(page, page.getByRole('link', { name: 'New listing' }));
      await expect(page.getByRole('heading', { name: 'Start a listing' })).toBeVisible(NAVIGATION);
      await check(page, `start-${w}`);

      // A finished draft, as if the host had typed everything (the phone test types it all).
      const id = fake.seed(sampleDraft());
      await open(page, `${BASE}/${id}`);
      await expect(page.getByRole('heading', { level: 1, name: 'New listing' })).toBeVisible(
        NAVIGATION,
      );
      await expect(page.getByLabel('Job title')).toHaveValue('Housekeeper');
      const form = page.getByRole('heading', { level: 2, name: '1 · Basics' });
      if (w === 1440) {
        const side = page.locator('#guest-card-side');
        await expect(side).toBeVisible();
        const formBox = await form.boundingBox();
        const cardBox = await side.boundingBox();
        expect(
          cardBox && formBox && cardBox.x > formBox.x + 200,
          'the card is beside the form',
        ).toBe(true);
      } else {
        await expect(page.locator('#guest-card-side')).toBeHidden();
        const review = page
          .locator('#section-review')
          .getByRole('heading', { name: 'What guests see' });
        const formBox = await form.boundingBox();
        const cardBox = await review.boundingBox();
        expect(
          cardBox && formBox && cardBox.y > formBox.y + 1000,
          'the card is under the form',
        ).toBe(true);
      }
      await check(page, `workspace-${w}`, { fullPage: false });

      // Autosave, then offline: the edit stays on screen and is saved when the connection is back.
      const title = page.getByLabel('Job title');
      await title.fill('Housekeeper, summer');
      await expect.poll(() => fake.patches.length).toBeGreaterThan(0);
      fake.offline = true;
      await page.context().setOffline(true);
      await title.fill('Housekeeper');
      await expect(page.getByText('You are offline').first()).toBeVisible();
      await expect(title).toHaveValue('Housekeeper');
      await check(page, `offline-${w}`, { fullPage: false });
      fake.offline = false;
      await page.context().setOffline(false);
      await expect(page.getByText('You are offline')).toHaveCount(0, NAVIGATION);
      await expect
        .poll(() => (fake.listings.get(id)?.draft.basics as { title?: string }).title)
        .toBe('Housekeeper');

      // A problem in a section shows once in Review's list, and "Fix it" goes to its field.
      const amount = page.locator('#f-pay-amount');
      await amount.fill('Good wages');
      await amount.blur();
      await expect(page.locator('#f-pay-amount-error')).toBeVisible();
      const review = page.locator('#section-review');
      await expect(review.getByText('Fix these before you publish')).toBeVisible();
      await tap(page, review.getByRole('button', { name: 'Fix it' }));
      await expect(amount).toBeFocused();
      await amount.fill('$18–$20');
      await expect(review.getByText('Fix these before you publish')).toHaveCount(0, NAVIGATION);
      await expect
        .poll(() => (fake.listings.get(id)?.draft.pay as { minCents?: number }).minCents)
        .toBe(1800);

      // Review and publish.
      await tap(page, page.getByRole('button', { name: /^10 · Review/ }));
      await expect(page.getByText('No wording problems found')).toBeVisible(NAVIGATION);
      await tap(
        page,
        page.getByText('The pay shown is the range we expect, in good faith, to pay for this job.'),
      );
      await tap(
        page,
        page.getByText('These hours and deductions are what we expect for this job.'),
      );
      await page.locator('#section-review').scrollIntoViewIfNeeded();
      await settle(page);
      expect(await seriousA11yIssues(page), 'axe on review').toEqual([]);
      await expect(page.locator('#section-review')).toHaveScreenshot(
        `flow-c-review-${w}.png`,
        screenshot,
      );
      await tap(page, page.getByRole('button', { name: 'Publish listing' }));
      await expect(page.getByRole('heading', { name: 'Housekeeper is in review' })).toBeVisible(
        NAVIGATION,
      );
      await check(page, `in-review-${w}`);
      expect(fake.contractErrors).toEqual([]);
      expect(fake.published).toHaveLength(1);
      test.info().annotations.push({ type: 'taps', description: `${w}: ${taps}` });
    });
  }

  test('listings loading and a failed load at 390, then a retry', async ({ page }) => {
    const fake = new FakeHost();
    await fake.install(page);
    await page.setViewportSize(PHONE);
    fake.listDelayMs = 4_000;
    await open(page, BASE);
    await expect(page.getByRole('status', { name: 'Loading your listings' })).toBeVisible(
      NAVIGATION,
    );
    await settle(page);
    await expect(page).toHaveScreenshot('flow-c-listings-loading-390.png', screenshot);
    fake.listDelayMs = 0;
    fake.failList = true;
    await page.reload();
    await expect(page.getByRole('heading', { name: 'We couldn’t load your listings' })).toBeVisible(
      NAVIGATION,
    );
    await check(page, 'listings-error-390');
    fake.failList = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'No listings yet' })).toBeVisible();
  });

  test('the Review step in dark mode at 390', async ({ page }) => {
    const fake = new FakeHost();
    await fake.install(page);
    await page.setViewportSize(PHONE);
    const id = fake.seed(sampleDraft());
    await open(page, `${BASE}/${id}?step=review`, 'dark');
    await expect(page.getByText('No wording problems found')).toBeVisible(NAVIGATION);
    await check(page, 'review-dark-390');
  });
});
