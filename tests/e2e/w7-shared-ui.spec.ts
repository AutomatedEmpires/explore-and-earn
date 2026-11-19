// SP4 W7 shared UI (#145) in Chromium at 390, 768 and 1440 px, light and dark: ReportSheet and the
// /report form, BlockDialog (seeker and host), MuteToggle, ApplicationSnapshotView,
// CandidateProfileView and NotificationList, with their loading, empty, error and sent states.
// Every screen passes axe at the serious and critical levels and matches its screenshot.
//
// It drives the development-only preview route (src/app/report/preview), which renders the real
// components on the Figma sample content without a signed-in user. The safety and notifications
// API is answered here by a fake that holds to the real contract: every report, block and host
// block body must pass the route's zod schema (reportSchema, blockSchema, hostBlockSchema).
//
// Run it (no database needed) with the Clerk development pair in the environment; without it
// every page answers 500 (see tests/e2e/flow-d-answer-applicant.spec.ts):
//   E2E_BASE_URL=http://localhost:3145 pnpm e2e tests/e2e/w7-shared-ui.spec.ts --project chromium
// The first run writes missing baselines and fails; run it again to compare. Baselines are
// rendered on Windows.
//
// Screenshots: tests/e2e/__screenshots__/w7-shared-ui.spec.ts/w7-<screen>-<width>[-dark].png
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { blockSchema, hostBlockSchema, reportSchema } from '@/lib/safety/schemas';
import { SAMPLE_IDS } from '@/app/report/preview/_lib/samples';

const BASE = '/report/preview';
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1440, height: 900 };
const WIDTHS = [PHONE, TABLET, DESKTOP] as const;
const NAVIGATION = { timeout: 60_000 };
const screenshot = { animations: 'disabled', maxDiffPixelRatio: 0.01, timeout: 30_000 } as const;

// --- The fake safety and notifications API --------------------------------------------------

type Notification = {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

function nid(n: number): string {
  return `019a4a3c-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

function sampleNotifications(now: number): Notification[] {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  return [
    {
      id: nid(1),
      type: 'hiring.message_received',
      category: 'messages',
      title: 'Kettle Ridge Lodge replied',
      body: 'Thanks for applying. Can you start May 15?',
      data: {},
      url: '/inbox',
      readAt: null,
      createdAt: ago(5),
    },
    {
      id: nid(2),
      type: 'applications.submitted',
      category: 'applications',
      title: 'Application sent',
      body: 'Lodge housekeeper at Kettle Ridge Lodge. They usually reply in 1 day.',
      data: {},
      url: '/profile/applied',
      readAt: null,
      createdAt: ago(180),
    },
    {
      id: nid(3),
      type: 'profiles.availability_stale',
      category: 'profile',
      title: 'Is May 15 still right?',
      body: 'Confirm your availability so hosts can find you.',
      data: {},
      url: '/profile',
      readAt: ago(2000),
      createdAt: ago(3 * 24 * 60),
    },
  ];
}

class FakeApi {
  contractErrors: string[] = [];
  reports: unknown[] = [];
  blocks: unknown[] = [];
  hostBlocks: unknown[] = [];
  mutes: string[] = [];
  reads: unknown[] = [];
  list: 'items' | 'empty' | 'error' | 'hold' = 'items';
  private held: Route[] = [];

  async install(page: Page): Promise<void> {
    const check = (name: string, ok: boolean, body: unknown) => {
      if (!ok) this.contractErrors.push(`${name}: ${JSON.stringify(body)}`);
    };
    await page.route('**/api/v1/reports', async (route) => {
      const body: unknown = route.request().postDataJSON();
      this.reports.push(body);
      check('POST /reports', reportSchema.safeParse(body).success, body);
      await route.fulfill({ status: 201, json: { reportId: nid(900) } });
    });
    await page.route('**/api/v1/me/blocks', async (route) => {
      const body: unknown = route.request().postDataJSON();
      this.blocks.push(body);
      check('PUT /me/blocks', blockSchema.safeParse(body).success, body);
      await route.fulfill({ status: 204 });
    });
    await page.route('**/api/v1/host/blocks', async (route) => {
      const body: unknown = route.request().postDataJSON();
      this.hostBlocks.push(body);
      check('PUT /host/blocks', hostBlockSchema.safeParse(body).success, body);
      await route.fulfill({ status: 204 });
    });
    await page.route(`**/api/v1/me/mutes/${SAMPLE_IDS.orgId}`, async (route) => {
      this.mutes.push(route.request().method());
      await route.fulfill({ status: 204 });
    });
    await page.route(
      (url) => url.pathname === '/api/v1/notifications',
      async (route) => {
        if (this.list === 'hold') {
          this.held.push(route);
          return;
        }
        if (this.list === 'error') {
          await route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'x' } } });
          return;
        }
        const items = this.list === 'empty' ? [] : sampleNotifications(Date.now());
        await route.fulfill({
          json: { items, nextBefore: null, unread: items.filter((i) => !i.readAt).length },
        });
      },
    );
    await page.route('**/api/v1/notifications/read', async (route) => {
      const body: unknown = route.request().postDataJSON();
      this.reads.push(body);
      await route.fulfill({ json: { unread: 0 } });
    });
  }
}

// --- Helpers ----------------------------------------------------------------------------------

async function seriousOrCritical(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function open(page: Page, screen: string, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto(`${BASE}/${screen}`, NAVIGATION);
  await page.evaluate(() => document.fonts.ready);
}

/** axe, then the screenshot. The name carries the width and the theme. */
async function check(page: Page, name: string, width: number, dark = false, fullPage = true) {
  expect(await seriousOrCritical(page)).toEqual([]);
  await expect(page).toHaveScreenshot(`w7-${name}-${width}${dark ? '-dark' : ''}.png`, {
    ...screenshot,
    fullPage,
  });
}

let api: FakeApi;

test.beforeEach(async ({ page }) => {
  api = new FakeApi();
  await api.install(page);
});

test.afterEach(() => {
  expect(api.contractErrors).toEqual([]);
});

// --- Report ---------------------------------------------------------------------------------

test.describe('report', () => {
  for (const size of WIDTHS) {
    test(`the full-page form at ${size.width}`, async ({ page }) => {
      await open(page, 'report', size);
      await expect(page.getByRole('heading', { level: 1, name: 'Report this job' })).toBeVisible();
      await check(page, 'report', size.width);
    });

    test(`the sheet at ${size.width}`, async ({ page }) => {
      await open(page, 'report-sheet', size);
      const trigger = page.getByRole('button', { name: 'Report' });
      await trigger.click();
      const sheet = page.getByRole('dialog', { name: 'Report this job' });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('button', { name: 'Send report' })).toBeDisabled();
      await check(page, 'report-sheet', size.width, false, false);

      await sheet.getByRole('radio', { name: 'Asks for money' }).check();
      await sheet.getByLabel('Details (optional)').fill('They asked for a deposit by wire.');
      await sheet.getByRole('button', { name: 'Send report' }).click();
      await expect(sheet.getByText('Thanks. We review every report.')).toBeVisible();
      expect(api.reports).toEqual([
        {
          subjectType: 'listing',
          subjectId: SAMPLE_IDS.listingId,
          reason: 'asks_for_money',
          details: 'They asked for a deposit by wire.',
        },
      ]);
      if (size === PHONE) await check(page, 'report-sheet-sent', size.width, false, false);

      await sheet.getByRole('button', { name: 'Done' }).click();
      await expect(sheet).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  }

  for (const size of [PHONE, DESKTOP]) {
    test(`dark and the states at ${size.width}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await open(page, 'report', size);
      await check(page, 'report', size.width, true);

      await page.emulateMedia({ colorScheme: 'light' });
      await page.getByRole('radio', { name: 'Scam or fraud' }).check();
      await page.getByRole('button', { name: 'Send report' }).click();
      await expect(page.getByText('Thanks. We review every report.')).toBeFocused();
      await check(page, 'report-sent', size.width);

      await open(page, 'report-unreadable', size);
      await expect(
        page.getByRole('heading', { level: 1, name: "We couldn't tell what you want to report" }),
      ).toBeVisible();
      await check(page, 'report-unreadable', size.width);
    });
  }
});

// --- Block and mute -------------------------------------------------------------------------

test.describe('block', () => {
  for (const size of WIDTHS) {
    test(`a seeker blocks a host at ${size.width}`, async ({ page }) => {
      await open(page, 'block-seeker', size);
      const opener = page.getByRole('button', { name: 'Block host' });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Block Kettle Ridge Lodge?' });
      await expect(dialog).toBeVisible();
      await check(page, 'block-seeker', size.width, false, false);

      await dialog.getByRole('checkbox', { name: /^Also withdraw my applications/ }).check();
      await dialog.getByRole('button', { name: 'Block', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
      expect(api.blocks).toEqual([
        { targetType: 'org', targetId: SAMPLE_IDS.orgId, withdrawApplications: true },
      ]);
    });
  }

  for (const size of [PHONE, DESKTOP]) {
    test(`a host blocks an applicant at ${size.width}`, async ({ page }) => {
      await open(page, 'block-host', size);
      await page.getByRole('button', { name: 'Block applicant' }).click();
      const dialog = page.getByRole('dialog', { name: 'Block Maya?' });
      await expect(dialog).toBeVisible();
      await expect(dialog).not.toContainText(/blocked you|notif/i);
      await check(page, 'block-host', size.width, false, false);
      await dialog.getByRole('button', { name: 'Block', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(api.hostBlocks).toEqual([{ applicationId: SAMPLE_IDS.applicationId }]);
    });

    test(`dark block dialog at ${size.width}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await open(page, 'block-seeker', size);
      await page.getByRole('button', { name: 'Block host' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await check(page, 'block-seeker', size.width, true, false);
    });

    test(`mute at ${size.width}`, async ({ page }) => {
      await open(page, 'mute', size);
      const toggle = page.getByRole('switch', { name: 'Mute Kettle Ridge Lodge' });
      await check(page, 'mute-off', size.width);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await expect.poll(() => api.mutes).toEqual(['PUT']);
      await check(page, 'mute-on', size.width);
      await toggle.press('Space');
      await expect.poll(() => api.mutes).toEqual(['PUT', 'DELETE']);
      await expect(toggle).toBeFocused();
    });
  }
});

// --- Snapshot and candidate views -----------------------------------------------------------

test.describe('views', () => {
  for (const size of WIDTHS) {
    for (const screen of ['snapshot-seeker', 'snapshot-host'] as const) {
      test(`${screen} at ${size.width}`, async ({ page }) => {
        await open(page, screen, size);
        await expect(page.getByRole('region', { name: 'Lodge housekeeper' })).toBeVisible();
        await expect(page.getByText('Self-reported')).toBeVisible();
        if (screen === 'snapshot-host') {
          await expect(page.getByText('Needs visa sponsorship', { exact: true })).toBeVisible();
        }
        await check(page, screen, size.width);
      });
    }
  }

  for (const size of [PHONE, DESKTOP]) {
    for (const screen of ['candidate-pool', 'candidate-interested'] as const) {
      test(`${screen} at ${size.width}`, async ({ page }) => {
        await open(page, screen, size);
        await expect(
          page.getByRole('heading', {
            name: screen === 'candidate-pool' ? 'Maya R.' : 'Maya Reyes',
          }),
        ).toBeVisible();
        if (screen === 'candidate-pool') await expect(page.getByText('Reyes')).toHaveCount(0);
        await check(page, screen, size.width);
      });
    }

    test(`dark snapshot at ${size.width}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await open(page, 'snapshot-seeker', size);
      await expect(page.getByRole('region', { name: 'Lodge housekeeper' })).toBeVisible();
      await check(page, 'snapshot-seeker', size.width, true);
    });
  }
});

// --- Notifications --------------------------------------------------------------------------

test.describe('notifications', () => {
  for (const size of WIDTHS) {
    test(`the list at ${size.width}`, async ({ page }) => {
      await open(page, 'notifications', size);
      await expect(page.getByText('Kettle Ridge Lodge replied')).toBeVisible();
      await check(page, 'notifications', size.width);
    });
  }

  for (const size of [PHONE, DESKTOP]) {
    test(`dark, states and mark read at ${size.width}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await open(page, 'notifications', size);
      await expect(page.getByText('Kettle Ridge Lodge replied')).toBeVisible();
      await check(page, 'notifications', size.width, true);
      await page.emulateMedia({ colorScheme: 'light' });

      await page.getByRole('button', { name: 'Mark all as read' }).click();
      await expect.poll(() => api.reads).toEqual([{ ids: 'all' }]);
      await expect(page.getByText('Unread')).toHaveCount(0);

      api.list = 'empty';
      await open(page, 'notifications', size);
      await expect(page.getByText('No notifications yet.')).toBeVisible();
      await check(page, 'notifications-empty', size.width);

      api.list = 'error';
      await open(page, 'notifications', size);
      await expect(page.getByRole('alert')).toContainText("We couldn't load your notifications");
      await check(page, 'notifications-error', size.width);

      api.list = 'hold';
      await open(page, 'notifications', size);
      await expect(page.getByRole('status', { name: 'Loading notifications' })).toBeVisible();
      await check(page, 'notifications-loading', size.width);
    });
  }

  test('a tapped row is marked read and opens its link', async ({ page }) => {
    await open(page, 'notifications', PHONE);
    await page.getByRole('link', { name: /Kettle Ridge Lodge replied/ }).click();
    await expect.poll(() => api.reads).toEqual([{ ids: [nid(1)] }]);
    // The inbox needs a signed-in seeker, so it may go on to sign-in; it left the list.
    await page.waitForURL((url) => !url.pathname.endsWith('/notifications'));
  });
});
