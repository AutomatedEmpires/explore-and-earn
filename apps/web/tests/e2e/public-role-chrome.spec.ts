import { expect, test, type Locator, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";

type ViewerRole = "guest" | "seeker" | "host" | "admin";

async function expectRouteToLoad(page: Page, path: string) {
  const response = await page.goto(path);

  expect(response).not.toBeNull();
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("body")).toBeVisible();
}

async function expectPublicRole(page: Page, role: ViewerRole) {
  const frame = page.locator(`[data-public-viewer-role="${role}"]`);
  await expect(frame).toHaveCount(1);
  await expect(frame).toBeVisible();
  return frame;
}

async function expectNoHorizontalOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
}

async function expectMinimumTarget(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function expectDockTargets(dock: Locator) {
  const links = dock.getByRole("link");
  await expect(links).toHaveCount(4);

  for (const link of await links.all()) {
    await expectMinimumTarget(link);
  }
}

async function expectSeekerSignInHref(
  locator: Locator,
  returnTo: string,
) {
  const rawHref = await locator.getAttribute("href");
  expect(rawHref).not.toBeNull();

  const href = new URL(rawHref!, BASE);
  expect(href.pathname).toBe("/sign-in");
  expect(href.searchParams.get("role")).toBe("seeker");
  expect(href.searchParams.get("returnTo")).toBe(returnTo);
}

const GUEST_SURFACES = [
  { path: "/", width: 320, height: 568 },
  { path: "/search", width: 375, height: 812 },
  { path: "/jobs", width: 390, height: 844 },
] as const;

test.describe("role-true public chrome", () => {
  for (const surface of GUEST_SURFACES) {
    test(`guest ${surface.path} is complete at ${surface.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: surface.width,
        height: surface.height,
      });
      await expectRouteToLoad(page, surface.path);
      await expectPublicRole(page, "guest");

      const header = page.getByRole("banner");
      const signIn = header.getByRole("button", {
        name: "Sign in",
        exact: true,
      });
      const getStarted = header.getByRole("link", {
        name: "Get started",
        exact: true,
      });
      await expect(signIn).toBeVisible();
      await expect(getStarted).toBeVisible();

      const dock = page.locator("nav[data-public-bottom-nav]");
      await expect(dock).toBeVisible();
      await expect(
        page.locator('nav[aria-label="Seeker"]'),
      ).toHaveCount(0);
      await expectSeekerSignInHref(
        dock.getByRole("link", { name: "Profile", exact: true }),
        "/profile",
      );

      await expectMinimumTarget(signIn);
      await expectMinimumTarget(getStarted);
      await expectDockTargets(dock);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("signed-in seeker keeps seeker identity and direct discovery chrome", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "seeker", url: BASE },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectRouteToLoad(page, "/");
    const frame = await expectPublicRole(page, "seeker");
    await expect(frame).toHaveAttribute("data-public-viewer-state", "dev-bench");

    const header = page.getByRole("banner");
    await expect(
      header.getByLabel("Signed in as Seeker", { exact: true }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await expect(
      header.getByRole("link", { name: "Get started", exact: true }),
    ).toHaveCount(0);

    const dock = page.locator("nav[data-public-bottom-nav]");
    await expect(dock).toBeVisible();
    await expect(
      dock.getByRole("link", { name: "Profile", exact: true }),
    ).toHaveAttribute("href", "/profile");
    await expect(
      header.getByRole("link", { name: "Your profile", exact: true }),
    ).toHaveAttribute("href", "/profile");
    await expect(
      header.getByRole("link", { name: "Notifications", exact: true }),
    ).toHaveAttribute("href", "/notifications");

    await expectDockTargets(dock);
    await expectNoHorizontalOverflow(page);
  });

  const WORKSPACE_ROLES = [
    {
      role: "host",
      path: "/search",
      workspace: "/host/listings",
      profile: "/host/profile",
      notifications: "/host/notifications",
    },
    {
      role: "admin",
      path: "/jobs",
      workspace: "/admin",
      profile: "/admin",
      notifications: "/admin/notifications",
    },
  ] as const;

  for (const viewer of WORKSPACE_ROLES) {
    test(`${viewer.role} public chrome returns to the correct workspace`, async ({
      context,
      page,
    }) => {
      await context.addCookies([
        { name: DEV_ROLE_COOKIE, value: viewer.role, url: BASE },
      ]);
      await page.setViewportSize({ width: 390, height: 844 });
      await expectRouteToLoad(page, viewer.path);
      const frame = await expectPublicRole(page, viewer.role);
      await expect(frame).toHaveAttribute(
        "data-public-viewer-state",
        "dev-bench",
      );

      const header = page.getByRole("banner");
      await expect(
        header.getByLabel(
          `Signed in as ${viewer.role === "host" ? "Host" : "Admin"}`,
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        header.getByRole("button", { name: "Sign in", exact: true }),
      ).toHaveCount(0);
      await expect(
        header.getByRole("link", { name: "Get started", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.locator("nav[data-public-bottom-nav]"),
      ).toHaveCount(0);

      const workspace = header.getByRole("link", {
        name: "Workspace",
        exact: true,
      });
      const exploreJobs = header.getByRole("link", {
        name: "Explore jobs",
        exact: true,
      });
      const profile = header.getByRole("link", {
        name: "Your profile",
        exact: true,
      });
      const notifications = header.getByRole("link", {
        name: "Notifications",
        exact: true,
      });
      await expect(workspace).toHaveAttribute("href", viewer.workspace);
      await expect(exploreJobs).toHaveAttribute("href", "/jobs");
      if (viewer.path === "/search" || viewer.path === "/jobs") {
        await expect(exploreJobs).toHaveAttribute("aria-current", "page");
      }
      await expect(profile).toHaveAttribute("href", viewer.profile);
      await expect(notifications).toHaveAttribute(
        "href",
        viewer.notifications,
      );

      await expectMinimumTarget(workspace);
      await expectMinimumTarget(exploreJobs);
      await expectMinimumTarget(profile);
      await expectMinimumTarget(notifications);
      await expectNoHorizontalOverflow(page);

      if (viewer.role === "host") {
        await exploreJobs.click();
        await expect(page).toHaveURL(`${BASE}/jobs`);
        await expectPublicRole(page, "host");
        await expect(page.locator("nav[data-public-bottom-nav]")).toHaveCount(0);
        await expect(page.locator('nav[aria-label="Seeker"]')).toHaveCount(0);
      }
    });
  }
});

test("guest /seek uses the seeker shell without inventing an identity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await expectRouteToLoad(page, "/seek");

  const shell = page.locator(
    '[data-seeker-shell][data-authenticated="false"]',
  );
  await expect(shell).toHaveCount(1);
  await expect(shell).toBeVisible();
  await expect(
    shell.getByLabel("Signed in as Seeker", { exact: true }),
  ).toHaveCount(0);
  await expect(shell.getByText("Explorer", { exact: true })).toHaveCount(0);
  await expect(shell.locator('[data-account-state="guest"]')).toHaveCount(1);
  await expect(shell.locator(".seekeros-avatarmini")).toHaveCount(0);
  await expect(page.locator("nav[data-public-bottom-nav]")).toHaveCount(0);

  const dock = shell.locator('nav[aria-label="Seeker"]');
  await expect(dock).toBeVisible();
  const links = dock.getByRole("link");
  await expect(links).toHaveCount(4);
  expect(await links.allTextContents()).toEqual([
    "Seek",
    "Swipe",
    "Map",
    "Profile",
  ]);
  await expectSeekerSignInHref(
    dock.getByRole("link", { name: "Profile", exact: true }),
    "/profile",
  );

  await expectDockTargets(dock);
  await expectNoHorizontalOverflow(page);

  await shell.getByRole("button", { name: "Open Seeker menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Seeker navigation" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Explorer", { exact: true })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: "Explore & Earn home" })).toHaveAttribute(
    "href",
    "/",
  );
});
