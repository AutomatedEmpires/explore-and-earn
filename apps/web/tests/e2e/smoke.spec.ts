import { expect, test, type Page } from "playwright/test";

/**
 * Shell-ownership + core-journey smoke, written against the KEYLESS harness
 * (playwright.config strips Clerk keys):
 *
 *  - middleware uses its fail-closed local fallback: public routes pass,
 *    protected routes 401 — asserted below as a real security property.
 *  - the dev mock bench (webpack-only Clerk shim + ee_dev_role cookie) is how
 *    authed role shells are traversed, exactly like local QA.
 *  - fixture listings resolve end-to-end through the /listing/[id]
 *    fixture-detail seam, so discover → inspect is a connected journey here.
 *
 * The product is mobile-first — shell assertions run at a phone viewport
 * (the role docks are mobile chrome).
 */

const DEV_ROLE_COOKIE = "ee_dev_role";
const BASE = "http://127.0.0.1:3100";

test.use({ viewport: { width: 390, height: 844 } });

async function expectRouteToLoad(path: string, page: Page) {
  const response = await page.goto(path);

  expect(response).not.toBeNull();
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("body")).toBeVisible();
}

function publicNav(page: Page) {
  return page.locator('nav[aria-label="Primary"]');
}

function seekerNav(page: Page) {
  return page.locator('nav[aria-label="Seeker"]');
}

function hostNav(page: Page) {
  return page.locator('nav[aria-label="Host"]');
}

test.describe("public surfaces (guest)", () => {
  test("/ renders the shared public dock and no role nav", async ({ page }) => {
    await expectRouteToLoad("/", page);

    await expect(publicNav(page)).toHaveCount(1);
    await expect(publicNav(page)).toBeVisible();
    await expect(seekerNav(page)).toHaveCount(0);
    await expect(hostNav(page)).toHaveCount(0);
  });

  test("/search renders the shared public dock and never error-boundaries", async ({
    page,
  }) => {
    await expectRouteToLoad("/search", page);

    await expect(publicNav(page)).toHaveCount(1);
    await expect(hostNav(page)).toHaveCount(0);
    // KNOWN-RED until migration 056 applies (CI db-migrate on merge): the
    // live DB lacks the anon subscription_tier grant this branch's public
    // queries need, so anonymous /search error-boundaries. This assertion is
    // the proof it's fixed — do not weaken it.
    await expect(page.getByText(/something went sideways/i)).toHaveCount(0);
  });

  test("/seek is reachable for signed-out visitors and never error-boundaries", async ({
    page,
  }) => {
    await expectRouteToLoad("/seek", page);
    // A data-layer failure (e.g. an RLS column grant missing for anon) renders
    // the route error boundary behind HTTP 200 — assert the real content
    // world rendered instead. (Caught live: migration 056.)
    await expect(page.getByText(/something went sideways/i)).toHaveCount(0);
  });

  test("fixture listing detail renders end-to-end (discover → inspect)", async ({
    page,
  }) => {
    await expectRouteToLoad("/listing/lst_orchard_wenatchee", page);

    await expect(
      page.getByRole("heading", { level: 1, name: /orchard harvest hand/i }),
    ).toBeVisible();
    // The triad is product law — housing/meals/pay visible on the detail page.
    await expect(page.getByText(/housing/i).first()).toBeVisible();
  });

  test("unknown listing ids render the honest not-found page, never the error boundary", async ({
    page,
  }) => {
    // The dev server streams, so the raw status can read 200 here even though
    // notFound() ran (production 404s properly — validated against a real
    // build). The semantic contract asserted instead: the NOT-FOUND UI
    // renders, and the old failure mode — a Postgres invalid-UUID throw
    // landing in the error boundary ("Couldn't load this listing") — never
    // comes back.
    await page.goto("/listing/lst_does_not_exist");
    await expect(page).toHaveTitle(/page not found/i);
    await expect(page.getByText(/couldn.t load this listing/i)).toHaveCount(0);
  });
});

test.describe("keyless auth fails closed", () => {
  test("a protected seeker route is denied without a session", async ({
    page,
  }) => {
    const res = await page.request.get("/saved");
    expect(res.status()).toBe(401);
  });
});

test.describe("impersonated seeker (dev bench)", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "seeker", url: BASE },
    ]);
  });

  test("/swipe renders the seeker dock exactly once", async ({ page }) => {
    await expectRouteToLoad("/swipe", page);

    await expect(seekerNav(page)).toHaveCount(1);
    await expect(seekerNav(page)).toBeVisible();
    await expect(hostNav(page)).toHaveCount(0);
  });
});

test.describe("impersonated host (dev bench)", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "host", url: BASE },
    ]);
  });

  test("/host renders the host dock exactly once", async ({ page }) => {
    await expectRouteToLoad("/host", page);

    await expect(hostNav(page)).toHaveCount(1);
    await expect(hostNav(page)).toBeVisible();
    await expect(seekerNav(page)).toHaveCount(0);
  });
});
