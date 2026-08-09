import { expect, test, type BrowserContext, type Locator, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";

const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

async function setRole(
  context: BrowserContext,
  role: "seeker" | "host",
) {
  await context.addCookies([{ name: DEV_ROLE_COOKIE, value: role, url: BASE }]);
}

async function hideOptionalDevBench(page: Page) {
  const devBench = page.getByRole("complementary", {
    name: "Dev mock bench",
    exact: true,
  });
  if ((await devBench.count()) > 0) {
    await devBench.evaluate((element) => {
      (element as HTMLElement).style.display = "none";
    });
  }
}

async function expectNoDocumentOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
}

async function expectContained(
  locator: Locator,
  container: Locator,
  label: string,
) {
  const [geometry, containerGeometry] = await Promise.all([
    locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth,
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
      };
    }),
    container.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }),
  ]);

  expect(
    geometry.scrollWidth,
    `${label} has internal horizontal overflow`,
  ).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.left, `${label} starts outside its container`).toBeGreaterThanOrEqual(
    containerGeometry.left - 1,
  );
  expect(geometry.right, `${label} ends outside its container`).toBeLessThanOrEqual(
    containerGeometry.right + 1,
  );
}

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has no rendered box`).not.toBeNull();
  expect(box!.width, `${label} is narrower than 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} is shorter than 44px`).toBeGreaterThanOrEqual(44);
}

async function expectAboveSeekerChrome(page: Page, locator: Locator) {
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" });
  });

  const target = await locator.boundingBox();
  const dock = await page
    .getByRole("navigation", { name: "Seeker", exact: true })
    .boundingBox();
  const replay = page.getByRole("button", {
    name: "Replay the quick tour",
    exact: true,
  });
  const replayBox = (await replay.count()) > 0 ? await replay.boundingBox() : null;

  expect(target).not.toBeNull();
  expect(dock).not.toBeNull();
  const fixedTop = Math.min(
    dock!.y,
    replayBox?.y ?? Number.POSITIVE_INFINITY,
  );
  expect(target!.y + target!.height).toBeLessThanOrEqual(fixedTop + 1);
}

test.describe("notification actions on phones", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie_consent", "essential");
      window.localStorage.setItem(
        "ee.seeker.coachmarks.v1",
        JSON.stringify({ index: 0, done: true }),
      );
    });
  });

  test("seeker notifications expose only the safe persisted destination", async ({
    context,
    page,
  }) => {
    const serverActionPosts: string[] = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        serverActionPosts.push(request.url());
        await route.abort();
        return;
      }
      await route.continue();
    });
    await setRole(context, "seeker");

    for (const viewport of PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/notifications");
      expect(response?.ok()).toBeTruthy();
      await expect(page).toHaveURL(`${BASE}/notifications`);
      await hideOptionalDevBench(page);

      await expect(
        page.getByRole("heading", { name: "Notifications", exact: true }),
      ).toBeVisible();
      const safeRow = page
        .getByRole("listitem")
        .filter({ hasText: "Offer ready to review" });
      const unsafeRow = page
        .getByRole("listitem")
        .filter({ hasText: "Legacy destination unavailable" });
      const actionlessRow = page
        .getByRole("listitem")
        .filter({ hasText: "Account details confirmed" });
      const action = safeRow.getByRole("link");

      await expect(safeRow).toHaveCount(1);
      await expect(unsafeRow).toHaveCount(1);
      await expect(actionlessRow).toHaveCount(1);
      await expect(action).toHaveAttribute("href", "/offered");
      await expect(action).toContainText("Open");
      await expect(unsafeRow.getByRole("link")).toHaveCount(0);
      await expect(actionlessRow.getByRole("link")).toHaveCount(0);
      await expect(page.locator('a[href*="evil.example"]')).toHaveCount(0);
      await expectTouchTarget(action, "seeker notification action");
      await expectTouchTarget(
        page.getByRole("button", { name: "Mark all as read", exact: true }),
        "Mark all as read",
      );
      await expectContained(safeRow, page.locator("body"), "safe seeker notification");
      await expectContained(unsafeRow, page.locator("body"), "unsafe seeker notification");
      await expectContained(actionlessRow, page.locator("body"), "actionless seeker notification");
      await expectNoDocumentOverflow(page);

      await expectAboveSeekerChrome(page, action);
      await action.focus();
      await expect(action).toBeFocused();
      await action.click();
      await expect(page).toHaveURL(`${BASE}/offered`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Offered", exact: true }),
      ).toBeVisible();
      expect(serverActionPosts).toEqual([]);
    }
  });

  test("host notifications expose only the safe persisted destination", async ({
    context,
    page,
  }) => {
    const serverActionPosts: string[] = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        serverActionPosts.push(request.url());
        await route.abort();
        return;
      }
      await route.continue();
    });
    await setRole(context, "host");

    for (const viewport of PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/host/notifications");
      expect(response?.ok()).toBeTruthy();
      await expect(page).toHaveURL(`${BASE}/host/notifications`);
      await hideOptionalDevBench(page);

      await expect(
        page.getByRole("heading", { name: "Notifications", exact: true }),
      ).toBeVisible();
      const safeRow = page
        .getByRole("listitem")
        .filter({ hasText: "Applicant pipeline ready" });
      const unsafeRow = page
        .getByRole("listitem")
        .filter({ hasText: "Legacy host destination unavailable" });
      const actionlessRow = page
        .getByRole("listitem")
        .filter({ hasText: "Workspace settings saved" });
      const action = safeRow.getByRole("link");

      await expect(action).toHaveAttribute("href", "/host");
      await expect(action).toContainText("Open");
      await expect(unsafeRow.getByRole("link")).toHaveCount(0);
      await expect(actionlessRow.getByRole("link")).toHaveCount(0);
      await expect(page.locator('a[href*="evil.example"]')).toHaveCount(0);
      await expectTouchTarget(action, "host notification action");
      await expectTouchTarget(
        page.getByRole("button", { name: "Mark all as read", exact: true }),
        "Mark all as read",
      );
      await expectContained(safeRow, page.locator("body"), "safe host notification");
      await expectContained(unsafeRow, page.locator("body"), "unsafe host notification");
      await expectContained(actionlessRow, page.locator("body"), "actionless host notification");
      await expectNoDocumentOverflow(page);

      await action.focus();
      await expect(action).toBeFocused();
      await action.click();
      await expect(page).toHaveURL(`${BASE}/host`);
      await expect(
        page.getByRole("heading", { name: /Wenatchee Orchard Co/, level: 1 }),
      ).toBeVisible();
      expect(serverActionPosts).toEqual([]);
    }
  });
});
