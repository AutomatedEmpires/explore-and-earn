// Flow B (issue #110): a seeker sends a first application. Page 02 frames: account bridge,
// apply ready, sent, error, offline, and application status, at 390, 768 and 1440. Tap counts
// are the frames' path: a returning seeker sends from review in one tap on this screen (open
// the job and Apply are the other two), and the first application on this screen stays within
// the 12-tap limit.
//
// The preview route renders the real screens without a signed-in seeker. Profile reads are still
// the W0 stub, so this spec answers the apply API with fixtures that pass the real schemas.
//
//   PORT=3072 node node_modules/@playwright/test/cli.js test tests/e2e/flow-b-first-application.spec.ts --project=chromium
// Screenshots: tests/e2e/__screenshots__/flow-b-first-application.spec.ts/
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { submitApplicationSchema } from '@/lib/applications';
import { profilePatchSchema } from '@/lib/profiles/schemas';
import { sampleContext, sampleProfile, sampleReceipt } from '@/app/(seeker)/apply/[listingId]/_lib/sample';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1440, height: 900 };
const WIDTHS = [PHONE, TABLET, DESKTOP] as const;
const screenshot = { animations: 'disabled' as const, maxDiffPixelRatio: 0.01, timeout: 30_000 };

const yesNo = {
  id: 'start',
  type: 'yes_no' as const,
  prompt: 'Can you start on May 15?',
  required: true,
};

let taps = 0;
async function tap(locator: Locator) {
  taps += 1;
  await locator.click();
}

async function seriousA11yIssues(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).exclude('nextjs-portal').analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function settle(page: Page) {
  await page.addStyleTag({
    content:
      'nextjs-portal, [data-clerk-keyless-prompt], .cl-keylessPrompt, [class*="keyless"] { display: none !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function check(page: Page, name: string) {
  await settle(page);
  expect(await seriousA11yIssues(page), `axe on ${name}`).toEqual([]);
  const size = page.viewportSize();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (size && height > size.height) await page.setViewportSize({ width: size.width, height });
  await expect(page).toHaveScreenshot(`flow-b-${name}.png`, screenshot);
  if (size) await page.setViewportSize(size);
}

test.skip(
  ({ isMobile, browserName }) => isMobile || browserName !== 'chromium',
  'One Chromium project, at 390, 768 and 1440',
);

test.describe('flow B frames', () => {
  for (const viewport of WIDTHS) {
    const width = String(viewport.width);

    test(`account bridge at ${width}`, async ({ page }) => {
      await page.setViewportSize({ ...viewport });
      await page.goto('/apply/preview');
      await expect(page.getByRole('heading', { name: 'Lodge housekeeper' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Continue' })).toHaveAttribute(
        'href',
        expect.stringContaining('/sign-in?redirect_url='),
      );
      await check(page, `bridge-${width}`);
    });

    test(`apply ready at ${width}`, async ({ page }) => {
      await page.route('**/api/v1/apply/**/context', (route) =>
        route.fulfill({ json: sampleContext() }),
      );
      await page.setViewportSize({ ...viewport });
      await page.goto('/apply/preview/flow');
      await expect(page.getByRole('button', { name: 'Send application' })).toBeVisible();
      await expect(page.getByText('Saved on this phone.')).toBeVisible();
      await check(page, `ready-${width}`);
    });

    test(`sent at ${width}`, async ({ page }) => {
      await page.setViewportSize({ ...viewport });
      await page.goto('/apply/preview/sent');
      await expect(page.getByRole('heading', { name: 'Application sent' })).toBeVisible();
      await check(page, `sent-${width}`);
    });

    test(`error at ${width}`, async ({ page }) => {
      await page.setViewportSize({ ...viewport });
      await page.goto('/apply/preview/error');
      await expect(page.getByRole('heading', { name: "We couldn't send your application" })).toBeVisible();
      await check(page, `error-${width}`);
    });

    test(`offline at ${width}`, async ({ page }) => {
      await page.setViewportSize({ ...viewport });
      await page.goto('/apply/preview/offline');
      await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
      await check(page, `offline-${width}`);
    });

    test(`application status at ${width}`, async ({ page }) => {
      await page.setViewportSize({ ...viewport });
      await page.goto('/apply/preview/status');
      await expect(page.getByRole('heading', { name: 'Lodge housekeeper' })).toBeVisible();
      await expect(page.getByText('You never pay to get a job.')).toBeVisible();
      await check(page, `status-${width}`);
    });
  }
});

test('a returning seeker sends from review in one tap', async ({ page }) => {
  const posts: unknown[] = [];
  await page.route('**/api/v1/apply/**/context', (route) => route.fulfill({ json: sampleContext() }));
  await page.route('**/api/v1/applications', async (route) => {
    const body: unknown = route.request().postDataJSON();
    const parsed = submitApplicationSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);
    posts.push(body);
    await route.fulfill({ status: 201, json: { application: sampleReceipt(), created: true } });
  });
  await page.setViewportSize(PHONE);
  taps = 0;
  await page.goto('/apply/preview/flow');
  await tap(page.getByRole('button', { name: 'Send application' }));
  await expect(page.getByRole('heading', { name: 'Application sent' })).toBeVisible();
  expect(taps).toBe(1);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ source: 'other', acknowledgeSponsorship: false });
});

test('a first application on this screen stays within 12 taps', async ({ page }) => {
  let saved = false;
  const patches: unknown[] = [];
  await page.route('**/api/v1/apply/**/context', (route) => {
    if (!saved) {
      return route.fulfill({
        json: sampleContext({
          missingFields: ['first_name', 'last_name', 'city', 'region', 'work_authorization'],
          preview: sampleProfile({
            firstName: '',
            lastName: '',
            city: '',
            region: null,
            workAuthorization: null,
          }),
        }),
      });
    }
    return route.fulfill({ json: sampleContext({ questions: [yesNo] }) });
  });
  await page.route('**/api/v1/me/profile', async (route) => {
    const body: unknown = route.request().postDataJSON();
    const parsed = profilePatchSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);
    patches.push(body);
    saved = true;
    await route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/applications', async (route) => {
    const parsed = submitApplicationSchema.safeParse(route.request().postDataJSON());
    expect(parsed.success).toBe(true);
    await route.fulfill({ status: 201, json: { application: sampleReceipt(), created: true } });
  });

  await page.setViewportSize(PHONE);
  taps = 0;
  await page.goto('/apply/preview/flow');
  await page.getByRole('textbox', { name: 'First name' }).fill('Maya');
  await page.getByRole('textbox', { name: 'Last name' }).fill('Reyes');
  await page.getByRole('textbox', { name: 'City' }).fill('Missoula');
  await tap(page.getByRole('combobox', { name: 'State' }));
  await tap(page.getByRole('option', { name: 'MT', exact: true }));
  await tap(page.getByRole('radio', { name: "I'm authorized to work in the US" }));
  await tap(page.getByRole('button', { name: 'Continue' }));
  await tap(page.getByRole('radio', { name: 'Yes' }));
  await tap(page.getByRole('button', { name: 'Review application' }));
  await tap(page.getByRole('button', { name: 'Send application' }));
  await expect(page.getByRole('heading', { name: 'Application sent' })).toBeVisible();
  expect(taps).toBeLessThanOrEqual(12);
  expect(patches).toHaveLength(1);
});
