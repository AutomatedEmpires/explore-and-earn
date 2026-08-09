import { expect, test, type Locator, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";
const LISTING_PATH = "/host/listings/new";
const PREVIEW_TITLE =
  "Seasonal Guest Experience and Orchard Operations Coordinator";

const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

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

async function expectBoxContained(
  locator: Locator,
  container: Locator,
  label: string,
) {
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
  ).toBeLessThanOrEqual(containerBox!.x + containerBox!.width + 1);
}

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has no rendered box`).not.toBeNull();
  expect(box!.width, `${label} is narrower than 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} is shorter than 44px`).toBeGreaterThanOrEqual(44);
}

test.describe("host listing form on phones", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "host", url: BASE },
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie_consent", "essential");
      window.localStorage.setItem(
        "ee_host_coachmarks_v1",
        JSON.stringify({ index: 0, done: true }),
      );
    });
  });

  test("contains the listing fields and preview without persisting a draft", async ({
    page,
  }) => {
    const serverActionPosts: string[] = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.method() === "POST" &&
        request.headers()["next-action"]
      ) {
        serverActionPosts.push(request.url());
        await route.abort();
        return;
      }

      await route.continue();
    });

    for (const viewport of PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      const response = await page.goto(LISTING_PATH);
      expect(response?.ok()).toBeTruthy();
      await expect(page).toHaveURL(`${BASE}${LISTING_PATH}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "New listing", exact: true }),
      ).toBeVisible();

      const devBench = page.getByRole("complementary", {
        name: "Dev mock bench",
        exact: true,
      });
      if ((await devBench.count()) > 0) {
        await devBench.evaluate((element) => {
          (element as HTMLElement).style.display = "none";
        });
      }

      const steps = page.getByRole("navigation", {
        name: "Listing steps",
        exact: true,
      });
      const form = steps.locator("xpath=..");
      const preview = page.getByRole("complementary", {
        name: "Live listing preview",
        exact: true,
      });
      const card = preview.locator("article");
      const title = page.getByRole("textbox", { name: "Title", exact: true });
      const titleField = title.locator("xpath=..");

      await expect(steps).toBeVisible();
      await expect(form).toHaveJSProperty("tagName", "FORM");
      await expect(preview).toBeVisible();
      await expect(card).toHaveCount(1);
      await expect(title).toBeVisible();
      await title.fill(PREVIEW_TITLE);
      await expect(
        preview.getByRole("button", { name: PREVIEW_TITLE, exact: true }),
      ).toBeVisible();

      await expectContained(form, page.locator("body"), "listing form");
      await expectContained(preview, page.locator("body"), "live preview");
      await expectContained(card, preview, "listing preview card");
      await expectContained(titleField, form, "title field");
      await expectBoxContained(title, titleField, "title input");
      await expectTouchTarget(title, "title input");
      await expectNoDocumentOverflow(page);

      await steps.getByRole("button", { name: /Story$/ }).click();
      const summary = page.getByRole("textbox", {
        name: "Summary",
        exact: true,
      });
      const summaryField = summary.locator("xpath=..");
      await expect(summary).toBeVisible();
      await expectContained(summaryField, form, "summary field");
      await expectBoxContained(summary, summaryField, "summary textarea");
      await expectTouchTarget(summary, "summary textarea");
      await expectNoDocumentOverflow(page);

      expect(
        serverActionPosts,
        `listing form sent a Next server action at ${viewport.width}px`,
      ).toEqual([]);
    }
  });
});
