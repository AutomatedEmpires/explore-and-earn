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
const BASE = "http://localhost:3100";

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
    // Guards the anon data path end-to-end (migration 056's grant): a missing
    // RLS column grant previously crashed anonymous /search behind HTTP 200.
    // Do not weaken this assertion.
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

  test("signed-out unsubscribe requests reach the signed-token handler", async ({
    request,
  }) => {
    const humanResponse = await request.get(
      "/api/notifications/unsubscribe?token=invalid",
      { maxRedirects: 0 },
    );
    expect(humanResponse.status()).toBe(200);
    expect(humanResponse.headers()["content-type"]).toContain("text/html");
    expect(await humanResponse.text()).toContain("This link has expired");

    const oneClickResponse = await request.post(
      "/api/notifications/unsubscribe?token=invalid",
      { maxRedirects: 0 },
    );
    expect(oneClickResponse.status()).toBe(400);
    expect(await oneClickResponse.json()).toEqual({ ok: false });
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
    const actionRail = page.getByRole("complementary", {
      name: "The deal and your next step",
    });
    await expect(actionRail).toHaveCount(1);
    expect(
      await actionRail.evaluate((element) => getComputedStyle(element).display),
    ).toBe("block");
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

  test("signed-out host onboarding preserves the host auth lane", async ({
    page,
  }) => {
    await page.goto("/host/onboarding");

    await expect(page).toHaveURL(/\/sign-in\?role=host&redirect_url=/);
    await expect(page.getByRole("tab", { name: /i.m a host/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("link", { name: /create an account/i })).toHaveAttribute(
      "href",
      "/sign-up?role=host&redirect_url=%2Fhost%2Fonboarding",
    );
  });

  test("signed-out role funnels preserve the exact requested path", async ({
    page,
  }) => {
    await page.goto("/host/messages?view=unread");
    let redirected = new URL(page.url());
    expect(redirected.pathname).toBe("/sign-in");
    expect(redirected.searchParams.get("role")).toBe("host");
    expect(redirected.searchParams.get("redirect_url")).toBe(
      "/host/messages?view=unread",
    );

    await page.goto("/onboarding/skills?source=resume");
    redirected = new URL(page.url());
    expect(redirected.pathname).toBe("/sign-in");
    expect(redirected.searchParams.get("role")).toBe("seeker");
    expect(redirected.searchParams.get("redirect_url")).toBe(
      "/onboarding/skills?source=resume",
    );

    const claimPath = "/claim/00000000-0000-4000-8000-000000000001";
    await page.goto(claimPath);
    redirected = new URL(page.url());
    expect(redirected.pathname).toBe("/sign-in");
    expect(redirected.searchParams.get("role")).toBe("host");
    expect(redirected.searchParams.get("redirect_url")).toBe(claimPath);

    const createAccount = page.getByRole("link", {
      name: /create an account/i,
    });
    const claimSignUpHref = await createAccount.getAttribute("href");
    expect(claimSignUpHref).not.toBeNull();
    let authLink = new URL(claimSignUpHref!, BASE);
    expect(authLink.pathname).toBe("/sign-up");
    expect(authLink.searchParams.get("role")).toBe("host");
    expect(authLink.searchParams.get("redirect_url")).toBe(claimPath);

    await page.goto(claimSignUpHref!);
    const signIn = page.getByRole("link", {
      name: /already have an account/i,
    });
    const claimSignInHref = await signIn.getAttribute("href");
    expect(claimSignInHref).not.toBeNull();
    authLink = new URL(claimSignInHref!, BASE);
    expect(authLink.pathname).toBe("/sign-in");
    expect(authLink.searchParams.get("role")).toBe("host");
    expect(authLink.searchParams.get("redirect_url")).toBe(claimPath);
  });

  test("auth entrypoints strip external return targets before Clerk renders", async ({
    page,
    request,
  }) => {
    const clerkReturn = `${BASE}/team/accept?token=invite-test`;
    const sameOriginSignIn = await request.get(
      `${BASE}/sign-in?redirect_url=${encodeURIComponent(clerkReturn)}`,
      { maxRedirects: 0 },
    );
    expect(sameOriginSignIn.status()).toBe(307);
    const normalizedSignIn = new URL(
      sameOriginSignIn.headers().location,
      BASE,
    );
    expect(normalizedSignIn.pathname).toBe("/sign-in");
    expect(normalizedSignIn.searchParams.get("redirect_url")).toBe(
      "/team/accept?token=invite-test",
    );

    const unsafeSignIn = await request.get(
      `${BASE}/sign-in?role=host&redirect_url=https%3A%2F%2Fattacker.example`,
      { maxRedirects: 0 },
    );
    expect(unsafeSignIn.status()).toBe(307);
    expect(new URL(unsafeSignIn.headers().location, BASE).toString()).toBe(
      `${BASE}/sign-in?role=host`,
    );

    await page.goto(
      "/sign-in?role=host&redirect_url=https%3A%2F%2Fattacker.example",
    );
    await expect(page).toHaveURL(`${BASE}/sign-in?role=host`);
    let canonical = new URL(page.url());
    expect(canonical.pathname).toBe("/sign-in");
    expect(canonical.searchParams.get("role")).toBe("host");
    expect(canonical.searchParams.has("redirect_url")).toBe(false);
    await expect(
      page.getByRole("link", { name: /create an account/i }),
    ).toHaveAttribute("href", "/sign-up?role=host");

    const unsafeSignUp = await request.get(
      `${BASE}/sign-up?role=host&redirect_url=%2F%2Fattacker.example`,
      { maxRedirects: 0 },
    );
    expect(unsafeSignUp.status()).toBe(307);
    expect(new URL(unsafeSignUp.headers().location, BASE).toString()).toBe(
      `${BASE}/sign-up?role=host`,
    );

    await page.goto(
      "/sign-up?role=host&redirect_url=%2F%2Fattacker.example",
    );
    await expect(page).toHaveURL(`${BASE}/sign-up?role=host`);
    canonical = new URL(page.url());
    expect(canonical.pathname).toBe("/sign-up");
    expect(canonical.searchParams.get("role")).toBe("host");
    expect(canonical.searchParams.has("redirect_url")).toBe(false);
    await expect(
      page.getByRole("link", { name: /already have an account/i }),
    ).toHaveAttribute("href", "/sign-in?role=host");
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
