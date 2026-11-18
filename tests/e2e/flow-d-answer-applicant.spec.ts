// Flow D, a host answers an applicant (issue #112; Figma 01 Host, section D "Host operations"), at
// 390, 768 and 1440 px: Applicants -> Reply -> Reply sent in 2 taps (Reply, Send reply), and Pass
// in 1 tap with a 10-second Undo. Plus the states: loading, couldn't load, offline, no applicants
// yet, a reply that didn't send (kept, and sent once on retry), sending offline, a read-only
// conversation and a role without access. Every screen passes axe at the serious and critical
// levels and matches its screenshot.
//
// It drives the development-only preview route (src/app/host/applicants/preview), which renders
// the real screens in the host shell without a signed-in host: a keyless Clerk development
// instance has Organizations turned off, so it can't sign a host in (tests/e2e/shells.spec.ts).
// The hiring and messaging API is answered here by a fake that holds to the real contract: the
// applicants query must pass the server's applicantsQuerySchema (read the way apiRoute reads a
// query string), and every reply must pass sendMessageSchema.
//
// Run it (no database needed) with the Clerk development pair, CLERK_SECRET_KEY and
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, in the environment. Without them the proxy skips
// clerkMiddleware, the host layout's auth() throws, and every /host page answers 500.
//   PORT=3072 pnpm e2e tests/e2e/flow-d-answer-applicant.spec.ts --project chromium
// The first run writes missing baselines and fails; run it again to compare. After an intended
// visual change: add --update-snapshots. Baselines are rendered on Windows.
//
// Screenshots: tests/e2e/__screenshots__/flow-d-answer-applicant.spec.ts/flow-d-<screen>-<width>.png
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type { ApplicantCardData } from '@/lib/hiring';
import { PASS_UNDO_MS } from '@/lib/hiring/constants';
import { applicantsQuerySchema } from '@/lib/hiring/schemas';
import { sendMessageSchema } from '@/lib/messaging/schemas';
import type { ReadOnlyReason } from '@/lib/messaging';
import {
  SAMPLE_IDS,
  sampleApplicant,
  sampleDetail,
  sampleSecondApplicant,
  sampleThread,
} from '@/app/host/applicants/_lib/sample';

const BASE = '/host/applicants/preview';
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1440, height: 900 };
const NAVIGATION = { timeout: 60_000 };
const screenshot = { animations: 'disabled', maxDiffPixelRatio: 0.01, timeout: 30_000 } as const;
const DEFAULT_NOTE = 'Thanks for applying. Can you start May 18?';

// --- The fake hiring and messaging API ----------------------------------------------------------

type Sent = { threadId: string; body: Record<string, unknown> };

class FakeHost {
  applicants: ApplicantCardData[] = [sampleApplicant()];
  /** Pending passes: application id -> commit time (ms). */
  pending = new Map<string, number>();
  undoMs = PASS_UNDO_MS;
  /** Problems the fake found in what the browser sent; the test asserts there are none. */
  contractErrors: string[] = [];
  passes: string[] = [];
  undos: string[] = [];
  shortlists: { id: string; on: unknown }[] = [];
  sent: Sent[] = [];
  listDelayMs = 0;
  failList: 'error' | 'denied' | null = null;
  failSendOnce = false;
  offline = false;
  readOnly: ReadOnlyReason | null = null;

  async install(page: Page): Promise<void> {
    // A request the page dropped (a reload, a navigation) can't be answered; that is fine.
    await page.route(/\/api\/v1\//, (route) => this.api(route).catch(() => undefined));
  }

  private json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  }

  private error(route: Route, status: number, code: string, message: string, details?: unknown) {
    return this.json(route, { error: { code, message, details, requestId: 'e2e' } }, status);
  }

  /** The query the way apiRoute reads it: one value is a string, a repeated key is a list. */
  private query(url: URL): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {};
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      out[key] = values.length === 1 ? (values[0] ?? '') : values;
    }
    return out;
  }

  private visible(now: number): ApplicantCardData[] {
    return this.applicants.filter((a) => {
      const commitAt = this.pending.get(a.applicationId);
      return commitAt === undefined || commitAt > now;
    });
  }

  private find(id: string): ApplicantCardData | undefined {
    return this.applicants.find((a) => a.applicationId === id);
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

    if (path === '/api/v1/host/applicants' && method === 'GET') {
      const parsed = applicantsQuerySchema.safeParse(this.query(url));
      if (!parsed.success) {
        this.contractErrors.push(`applicants query: ${parsed.error.message}`);
        return this.error(route, 400, 'bad_request', 'Invalid input');
      }
      if (this.listDelayMs) await new Promise((r) => setTimeout(r, this.listDelayMs));
      if (this.failList === 'denied')
        return this.error(route, 403, 'forbidden', 'Not allowed', { reason: 'role_not_allowed' });
      if (this.failList === 'error') return this.error(route, 500, 'internal', 'Internal error');
      const now = Date.now();
      const statuses = parsed.data.status;
      const items = this.visible(now)
        .filter((a) => !statuses || statuses.includes(a.status))
        .map((a) => {
          const commitAt = this.pending.get(a.applicationId);
          return { ...a, undoUntil: commitAt ? new Date(commitAt).toISOString() : null };
        });
      return this.json(route, { items, counts: { new: items.length }, nextCursor: null });
    }

    const applicant = /^\/api\/v1\/host\/applicants\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (applicant) {
      const card = this.find(applicant[1] ?? '');
      if (!card) return this.error(route, 404, 'not_found', 'Not found');
      const action = applicant[2];
      if (!action && method === 'GET') return this.json(route, sampleDetail(card));
      if (action === 'pass' && method === 'POST') {
        this.passes.push(card.applicationId);
        const commitAt = this.pending.get(card.applicationId) ?? Date.now() + this.undoMs;
        this.pending.set(card.applicationId, commitAt);
        return this.json(route, { undoUntil: new Date(commitAt).toISOString() });
      }
      if (action === 'pass/undo' && method === 'POST') {
        const commitAt = this.pending.get(card.applicationId);
        if (commitAt === undefined || Date.now() >= commitAt) {
          return this.error(route, 409, 'conflict', 'Too late to undo', {
            reason: 'undo_expired',
          });
        }
        this.undos.push(card.applicationId);
        this.pending.delete(card.applicationId);
        return this.json(route, { status: card.status });
      }
      if (action === 'shortlist' && method === 'POST') {
        const on = body().on;
        this.shortlists.push({ id: card.applicationId, on });
        if (typeof on !== 'boolean') this.contractErrors.push('shortlist: on must be a boolean');
        card.status = on ? 'shortlisted' : 'new';
        return this.json(route, { status: card.status });
      }
    }

    const thread = /^\/api\/v1\/threads\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (thread) {
      const card = this.applicants.find((a) => a.threadId === thread[1]);
      if (!card) return this.error(route, 404, 'not_found', 'Not found');
      const action = thread[2];
      if (!action && method === 'GET') {
        const view = sampleThread(card);
        return this.json(route, {
          ...view,
          readOnly: this.readOnly,
          canSend: this.readOnly === null,
          cards: {},
        });
      }
      if (action === 'messages' && method === 'POST') {
        const sent = body();
        const parsed = sendMessageSchema.safeParse(sent);
        if (!parsed.success) this.contractErrors.push(`reply: ${parsed.error.message}`);
        this.sent.push({ threadId: card.threadId ?? '', body: sent });
        if (this.failSendOnce) {
          this.failSendOnce = false;
          return this.error(route, 500, 'internal', 'Internal error');
        }
        if (this.readOnly) {
          return this.error(route, 409, 'conflict', 'Read only', { reason: 'read_only' });
        }
        return this.json(route, {
          message: {
            id: '0193a000-0000-7000-8000-0000000000c1',
            clientId: parsed.success ? parsed.data.clientId : null,
            kind: 'text',
            mine: true,
            senderType: 'host',
            senderFirstName: 'Sam',
            body: parsed.success ? (parsed.data.body ?? null) : null,
            attachments: [],
            card: null,
            event: null,
            warn: false,
            state: 'sending',
            createdAt: new Date().toISOString(),
          },
        });
      }
    }

    this.contractErrors.push(`unexpected ${method} ${path}`);
    return this.error(route, 404, 'not_found', 'Not found');
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

/** axe-clean, then the screenshot of the viewport. */
async function check(page: Page, name: string) {
  await settle(page);
  expect(await seriousA11yIssues(page), `axe on ${name}`).toEqual([]);
  await expect(page).toHaveScreenshot(`flow-d-${name}.png`, screenshot);
}

async function open(page: Page, path: string, theme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  const res = await page.goto(path, NAVIGATION);
  expect(res?.status(), `${path} status`).toBe(200);
}

function card(page: Page, name: string): Locator {
  return page.getByRole('article').filter({ has: page.getByRole('link', { name }) });
}

const applicantsHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Applicants' });

test.describe('Flow D: a host answers an applicant', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.skip(
    ({ isMobile, browserName }) => isMobile || browserName !== 'chromium',
    'Chromium desktop sets each width itself',
  );

  for (const viewport of [PHONE, TABLET, DESKTOP]) {
    const w = viewport.width;
    test(`at ${w}: Reply, then Send reply (2 taps)`, async ({ page }) => {
      const fake = new FakeHost();
      await fake.install(page);
      await page.setViewportSize(viewport);
      await open(page, BASE);
      await expect(applicantsHeading(page)).toBeVisible(NAVIGATION);
      const maya = card(page, 'Maya Chen');
      await expect(maya).toBeVisible();
      await expect(maya.getByText('Applied today')).toBeVisible();
      await expect(maya.getByText('· Applied for Lodge Cook')).toBeVisible();
      await expect(maya.getByText('Available May 10, 2027')).toBeVisible();
      await check(page, `applicants-${w}`);

      taps = 0;
      await tap(page, maya.getByRole('link', { name: 'Reply' }));
      await expect(page.getByRole('heading', { level: 1, name: 'Reply to Maya Chen' })).toBeVisible(
        NAVIGATION,
      );
      const reply = page.getByRole('textbox', { name: /Your reply/ });
      await expect(reply).toHaveValue(DEFAULT_NOTE);
      await check(page, `reply-${w}`);

      await tap(page, page.getByRole('button', { name: 'Send reply' }));
      await expect(page.getByRole('heading', { level: 1, name: 'Maya has your reply' })).toBeVisible();
      await expect(page.getByText('Reply sent to Maya Chen.')).toBeVisible();
      await check(page, `reply-sent-${w}`);

      expect(taps, 'taps from the list to a sent reply').toBe(2);
      expect(fake.sent).toHaveLength(1);
      expect(fake.sent[0]?.threadId).toBe(SAMPLE_IDS.thread);
      expect(fake.sent[0]?.body.body).toBe(DEFAULT_NOTE);
      expect(fake.contractErrors).toEqual([]);

      await page.getByRole('link', { name: 'Back to applicants' }).click();
      await expect(applicantsHeading(page)).toBeVisible(NAVIGATION);
      test.info().annotations.push({ type: 'taps', description: `${w}, list to reply sent: ${taps}` });
    });
  }

  test('a changed reply is sent as written', async ({ page }) => {
    const fake = new FakeHost();
    await fake.install(page);
    await page.setViewportSize(PHONE);
    await open(page, `${BASE}/messages/${SAMPLE_IDS.thread}/reply`);
    const reply = page.getByRole('textbox', { name: /Your reply/ });
    await expect(reply).toHaveValue(DEFAULT_NOTE, NAVIGATION);
    await reply.fill('Hi Maya, can you talk Thursday at 10?');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Maya has your reply' })).toBeVisible();
    expect(fake.sent.map((s) => s.body.body)).toEqual(['Hi Maya, can you talk Thursday at 10?']);

    // An empty reply is never sent.
    await page.goto(`${BASE}/messages/${SAMPLE_IDS.thread}/reply`, NAVIGATION);
    await expect(reply).toHaveValue(DEFAULT_NOTE, NAVIGATION);
    await reply.fill('   ');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByText('Write a reply first.')).toBeVisible();
    expect(fake.sent).toHaveLength(1);
    expect(fake.contractErrors).toEqual([]);
  });

  for (const viewport of [PHONE, DESKTOP]) {
    const w = viewport.width;
    test(`at ${w}: Pass in 1 tap, with a 10-second Undo`, async ({ page }) => {
      const fake = new FakeHost();
      await fake.install(page);
      await page.setViewportSize(viewport);
      await open(page, BASE);
      await expect(card(page, 'Maya Chen')).toBeVisible(NAVIGATION);

      taps = 0;
      await tap(page, card(page, 'Maya Chen').getByRole('button', { name: 'Pass' }));
      const toast = page.getByRole('status').filter({ hasText: 'Maya Chen passed' });
      await expect(toast).toBeVisible();
      await expect(toast).toContainText('Maya won’t be told for 10 seconds.');
      await expect(page.getByRole('heading', { name: 'You’re caught up' })).toBeVisible();
      await expect(page.getByText('No one else is waiting on a reply for Lodge Cook.')).toBeVisible();
      expect(taps, 'taps to pass').toBe(1);
      expect(fake.passes).toEqual([SAMPLE_IDS.application]);
      await check(page, `passed-${w}`);

      await toast.getByRole('button', { name: 'Undo' }).click();
      await expect(card(page, 'Maya Chen')).toBeVisible();
      await expect(page.getByText('Maya Chen passed')).toHaveCount(0);
      expect(fake.undos).toEqual([SAMPLE_IDS.application]);
      expect(fake.contractErrors).toEqual([]);
    });
  }

  test('the Undo closes when its window does, and the pass stands', async ({ page }) => {
    const fake = new FakeHost();
    fake.applicants = [sampleApplicant(), sampleSecondApplicant()];
    fake.undoMs = 2_000;
    await fake.install(page);
    await page.setViewportSize(PHONE);
    await open(page, BASE);
    // Jordan has no photo and fit is off for him: initials and an empty Fit chip.
    const jordan = card(page, 'Jordan Reyes');
    await expect(jordan).toBeVisible(NAVIGATION);
    await expect(jordan.getByText('JR')).toBeVisible();
    await expect(jordan.getByText('—')).toBeVisible();

    await jordan.getByRole('button', { name: 'Pass' }).click();
    const toast = page.getByRole('status').filter({ hasText: 'Jordan Reyes passed' });
    await expect(toast).toBeVisible();
    await expect(card(page, 'Maya Chen')).toBeVisible();
    await expect(toast).toHaveCount(0, { timeout: 5_000 });
    await page.reload(NAVIGATION);
    await expect(card(page, 'Maya Chen')).toBeVisible(NAVIGATION);
    await expect(card(page, 'Jordan Reyes')).toHaveCount(0);
    expect(fake.undos).toEqual([]);
  });

  test('Shortlist marks the card and keeps it on the list', async ({ page }) => {
    const fake = new FakeHost();
    await fake.install(page);
    await page.setViewportSize(PHONE);
    await open(page, BASE);
    const shortlist = card(page, 'Maya Chen').getByRole('button', { name: 'Shortlist' });
    await expect(shortlist).toHaveAttribute('aria-pressed', 'false', NAVIGATION);
    await shortlist.click();
    await expect(shortlist).toHaveAttribute('aria-pressed', 'true');
    expect(fake.shortlists).toEqual([{ id: SAMPLE_IDS.application, on: true }]);
    expect(fake.contractErrors).toEqual([]);
  });

  test('applicants: loading, a failed load, offline, none yet and no access', async ({ page }) => {
    const fake = new FakeHost();
    await fake.install(page);
    await page.setViewportSize(PHONE);

    fake.listDelayMs = 4_000;
    await open(page, BASE);
    await expect(page.getByRole('status', { name: 'Loading applicants' })).toBeVisible(NAVIGATION);
    await settle(page);
    await expect(page).toHaveScreenshot('flow-d-applicants-loading-390.png', screenshot);
    fake.listDelayMs = 0;

    fake.failList = 'error';
    await page.reload(NAVIGATION);
    await expect(page.getByRole('heading', { name: 'We couldn’t load applicants' })).toBeVisible(
      NAVIGATION,
    );
    await check(page, 'applicants-error-390');
    fake.failList = null;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(card(page, 'Maya Chen')).toBeVisible();

    fake.offline = true;
    await page.reload(NAVIGATION);
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible(NAVIGATION);
    await expect(page.getByText('Applicants will load when you are back.')).toBeVisible();
    await check(page, 'applicants-offline-390');
    fake.offline = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(card(page, 'Maya Chen')).toBeVisible();

    fake.applicants = [];
    await page.reload(NAVIGATION);
    await expect(page.getByRole('heading', { name: 'No applicants yet' })).toBeVisible(NAVIGATION);
    await check(page, 'applicants-empty-390');

    fake.failList = 'denied';
    await page.reload(NAVIGATION);
    await expect(page.getByRole('heading', { name: 'Applicants are hidden for your role' })).toBeVisible(
      NAVIGATION,
    );
    expect(await seriousA11yIssues(page)).toEqual([]);
    expect(fake.contractErrors).toEqual([]);
  });

  test('reply: it didn’t send, then sent once on retry; offline; read-only', async ({ page }) => {
    const fake = new FakeHost();
    await fake.install(page);
    await page.setViewportSize(PHONE);
    const replyPath = `${BASE}/messages/${SAMPLE_IDS.thread}/reply`;

    fake.failSendOnce = true;
    await open(page, replyPath);
    const reply = page.getByRole('textbox', { name: /Your reply/ });
    await expect(reply).toHaveValue(DEFAULT_NOTE, NAVIGATION);
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Your reply didn’t send' })).toBeVisible();
    await expect(reply).toHaveValue(DEFAULT_NOTE);
    await check(page, 'reply-failed-390');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Maya has your reply' })).toBeVisible();
    // Both tries carry the same clientId, so the server stores the reply once.
    expect(fake.sent).toHaveLength(2);
    expect(fake.sent[0]?.body.clientId).toBe(fake.sent[1]?.body.clientId);

    await page.goto(replyPath, NAVIGATION);
    await expect(reply).toHaveValue(DEFAULT_NOTE, NAVIGATION);
    fake.offline = true;
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'You are offline' })).toBeVisible();
    await expect(reply).toHaveValue(DEFAULT_NOTE);
    fake.offline = false;

    fake.readOnly = 'withdrawn';
    await page.goto(replyPath, NAVIGATION);
    await expect(page.getByText('This conversation is read-only')).toBeVisible(NAVIGATION);
    await expect(page.getByRole('button', { name: 'Send reply' })).toHaveCount(0);
    await check(page, 'reply-read-only-390');
    expect(fake.contractErrors).toEqual([]);
  });
});
