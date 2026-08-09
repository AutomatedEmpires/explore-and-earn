import { expect, test, type Locator, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";
const ROUTES = ["/home", "/profile"] as const;
const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;
const TIMELINE_LABELS = [
  "Ready now",
  "In 1 month",
  "In 3 months",
  "In 6 months",
] as const;

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

async function expectContained(locator: Locator, container: Locator, label: string) {
  const [box, containerBox] = await Promise.all([
    locator.boundingBox(),
    container.boundingBox(),
  ]);
  expect(box, `${label} has no rendered box`).not.toBeNull();
  expect(containerBox, `${label} container has no rendered box`).not.toBeNull();
  expect(box!.x, `${label} starts outside its container`).toBeGreaterThanOrEqual(
    containerBox!.x - 1,
  );
  expect(
    box!.x + box!.width,
    `${label} ends outside its container`,
  ).toBeLessThanOrEqual(
    containerBox!.x + containerBox!.width + 1,
  );
}

test.describe("seeker readiness on phones", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "seeker", url: BASE },
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie_consent", "essential");
      window.localStorage.setItem(
        "ee.seeker.coachmarks.v1",
        JSON.stringify({ index: 0, done: true }),
      );
    });
  });

  test("shows an unset, contained four-choice control on home and profile", async ({
    page,
  }) => {
    for (const viewport of PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);

      for (const route of ROUTES) {
        const response = await page.goto(route);
        expect(response?.ok()).toBeTruthy();
        await hideOptionalDevBench(page);

        const region = page.getByRole("region", {
          name: "Availability",
          exact: true,
        });
        const group = page.getByRole("group", {
          name: "Availability",
          exact: true,
        });
        await expect(region).toBeVisible();
        await expect(group).toBeVisible();
        await expect(region.getByText("Not set", { exact: true })).toBeVisible();
        await expect(group.getByRole("button")).toHaveCount(4);

        await region.scrollIntoViewIfNeeded();
        await expectContained(group, region, `${route} availability choices`);

        const rowPositions: number[] = [];
        for (const label of TIMELINE_LABELS) {
          const button = group.getByRole("button", { name: label, exact: true });
          await expect(button).toHaveAttribute("aria-pressed", "false");
          const box = await button.boundingBox();
          expect(box, `${label} has no rendered box`).not.toBeNull();
          expect(
            box!.width,
            `${label} is narrower than 44px`,
          ).toBeGreaterThanOrEqual(44);
          expect(
            box!.height,
            `${label} is shorter than 44px`,
          ).toBeGreaterThanOrEqual(44);
          await expectContained(button, group, label);
          rowPositions.push(Math.round(box!.y));
        }

        expect(new Set(rowPositions).size).toBe(2);
        await expectNoDocumentOverflow(page);
      }
    }
  });

  test("submits the first Ready now choice and rolls back a failed save", async ({
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

    await page.setViewportSize(PHONE_VIEWPORTS[0]);
    const response = await page.goto("/home");
    expect(response?.ok()).toBeTruthy();
    await hideOptionalDevBench(page);

    const region = page.getByRole("region", {
      name: "Availability",
      exact: true,
    });
    const readyNow = region.getByRole("button", {
      name: "Ready now",
      exact: true,
    });
    await region.scrollIntoViewIfNeeded();
    await expect(readyNow).toHaveAttribute("aria-pressed", "false");
    await readyNow.click();

    await expect.poll(() => serverActionPosts.length).toBe(1);
    await expect(region.getByRole("alert")).toContainText(
      "We couldn't save your availability. Try again.",
    );
    await expect(readyNow).toHaveAttribute("aria-pressed", "false");
    await expect(region.getByText("Not set", { exact: true })).toBeVisible();
    await expect(
      region.getByText("Availability saved.", { exact: true }),
    ).toHaveCount(0);
  });
});
