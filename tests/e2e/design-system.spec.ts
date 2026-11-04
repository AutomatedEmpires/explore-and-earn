// The design-system gallery (foundation spec section 10): every gallery, reference and top bar
// route renders, passes axe at the serious and critical levels, and matches its screenshot
// baseline in light and dark, at 390 px (a phone) and 1280 px (a laptop).
//
// Run it (no database or Clerk needed; Playwright starts `pnpm dev` unless E2E_BASE_URL is set):
//   PORT=3061 pnpm e2e tests/e2e/design-system.spec.ts --project chromium
// The first run writes missing baselines and fails; run it again to compare. After an
// intended visual change: add --update-snapshots. The baselines are rendered on Windows; font
// rasterizing differs by OS, so regenerate them on the OS that compares them.
//
// Screenshots: tests/e2e/__screenshots__/design-system.spec.ts/design-<route>-<theme>-<width>.png
// (the founder's design review package, Task 26, copies them from there).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type Route = {
  name: string;
  path: string;
  fullPage?: boolean;
  /** Runs after the page settles, before axe and the screenshot. */
  prepare?: (page: Page) => Promise<void>;
};

/**
 * The Housing reference opens its sheet on load, which moves focus to Close with a visible
 * ring. A tap inside the sheet shows it as it looks when a seeker taps the chip.
 */
async function tapInsideHousingSheet(page: Page): Promise<void> {
  const sheet = page.getByRole('dialog', { name: 'Housing' });
  await expect(sheet).toBeVisible();
  await sheet.getByText(/5-minute walk/).click();
}

const SECTIONS = [
  'foundations',
  'buttons',
  'chips',
  'identity',
  'cards',
  'forms',
  'navigation',
  'overlays',
  'feedback',
  'charts',
] as const;

const REFERENCE = [
  'seek',
  'candidate',
  'housing',
  'host-header',
  'profile-header',
  'community-post',
] as const;

const ROUTES: Route[] = [
  { name: 'index', path: '/design-system' },
  ...SECTIONS.map((s) => ({ name: s, path: `/design-system/${s}` })),
  ...REFERENCE.map((r) => ({
    name: `reference-${r}`,
    path: `/design-system/reference/${r}`,
    // The Housing pop-up is open over the Seek screen: capture what the screen shows.
    fullPage: r !== 'housing',
    prepare: r === 'housing' ? tapInsideHousingSheet : undefined,
  })),
  { name: 'topbar-options', path: '/design-system/topbar-options' },
];

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;

// One browser is enough: each test sets its own viewport, and the snapshot names carry no
// project name, so a second project would compare against the same files.
test.skip(({ isMobile }) => isMobile, 'Runs once, in desktop Chromium, at both widths');
test.describe.configure({ mode: 'parallel' });

/**
 * Waits for hydration, then scrolls through the page so every lazy image (cards use
 * loading="lazy") loads, and waits for the images and fonts.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  // The Next.js dev indicator is not part of the page.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.evaluate(async () => {
    const pause = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await pause();
    }
    window.scrollTo(0, 0);
    // A lazy image that isn't rendered (inside display: none) never loads; skip those.
    const shown = Array.from(document.images).filter((img) => img.getClientRects().length > 0);
    const loaded = (img: HTMLImageElement) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 10_000);
          });
    await Promise.all(shown.map(loaded));
    await document.fonts.ready;
  });
}

async function seriousA11yIssues(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).exclude('nextjs-portal').analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function open(page: Page, path: string, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  const res = await page.goto(path);
  expect(res?.status(), `${path} status`).toBe(200);
  await settle(page);
}

const screenshot = { animations: 'disabled', maxDiffPixelRatio: 0.002, timeout: 30_000 } as const;

/**
 * Grows the viewport to the page's height, so a full-page capture shows sticky bars (the bottom
 * tabs) where they rest at the end of the page rather than stitched in mid-page.
 */
async function fitViewportToPage(page: Page, width: number, minHeight: number): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const current = page.viewportSize()?.height ?? 0;
    const next = Math.max(minHeight, height);
    if (next === current) return;
    await page.setViewportSize({ width, height: next });
  }
}

for (const route of ROUTES) {
  for (const theme of THEMES) {
    test(`${route.name} in ${theme}: 200, axe-clean and matches its baselines`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await open(page, route.path, theme);
        await route.prepare?.(page);
        expect(await seriousA11yIssues(page), `axe at ${viewport.width} px`).toEqual([]);
        if (route.fullPage ?? true) {
          await fitViewportToPage(page, viewport.width, viewport.height);
        }
        await expect(page).toHaveScreenshot(
          `design-${route.name}-${theme}-${viewport.width}.png`,
          screenshot,
        );
      }
    });
  }
}

// Overlays render in a portal, outside the gallery's themed frames, so their open states are
// captured here, once per theme.
for (const theme of THEMES) {
  test(`overlays open in ${theme}: sheet, dialog and tooltip`, async ({ page }) => {
    test.setTimeout(180_000);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      const name = (what: string) => `design-overlays-${what}-${theme}-${viewport.width}.png`;

      await open(page, '/design-system/overlays', theme);
      await page.getByRole('button', { name: 'Open the Housing sheet' }).first().click();
      const sheet = page.getByRole('dialog', { name: 'Housing' });
      await expect(sheet).toBeVisible();
      expect(await seriousA11yIssues(page), 'axe with the sheet open').toEqual([]);
      await expect(page).toHaveScreenshot(name('sheet'), screenshot);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();

      await page.getByRole('button', { name: 'Withdraw application' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Withdraw your application?' });
      await expect(dialog).toBeVisible();
      expect(await seriousA11yIssues(page), 'axe with the dialog open').toEqual([]);
      await expect(page).toHaveScreenshot(name('dialog'), screenshot);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      const tipTrigger = page.getByRole('button', { name: 'Fit score' }).first();
      await tipTrigger.scrollIntoViewIfNeeded();
      await tipTrigger.hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await expect(page).toHaveScreenshot(name('tooltip'), screenshot);
    }
  });
}

test('the gallery index links to every gallery, reference and top bar route', async ({ page }) => {
  await open(page, '/design-system', 'light');
  const main = page.getByRole('main');
  for (const route of ROUTES.filter((r) => r.name !== 'index')) {
    await expect(main.locator(`a[href="${route.path}"]`).first(), route.path).toBeVisible();
  }
});

test('an unknown gallery section is a 404', async ({ page }) => {
  const res = await page.goto('/design-system/not-a-section');
  expect(res?.status()).toBe(404);
});

test('on the Seek reference, the Housing chip opens its sheet and Escape returns focus', async ({
  page,
}) => {
  await open(page, '/design-system/reference/seek', 'light');
  const chip = page
    .getByRole('article')
    .first()
    .getByRole('button', { name: /^Housing/ });
  await chip.click();
  const sheet = page.getByRole('dialog', { name: 'Housing' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('$150/mo · deducted from pay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(chip).toBeFocused();
});

test('the hamburger top bar option opens a menu with the shell destinations', async ({ page }) => {
  await open(page, '/design-system/topbar-options', 'light');
  await page.getByRole('button', { name: 'Menu' }).first().click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  for (const label of ['Community', 'Inbox', 'Notifications', 'Profile', 'Settings']) {
    await expect(menu.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
  }
});
