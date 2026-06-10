import { expect, test, type Page } from "playwright/test";

async function expectRouteToLoad(path: string, page: Page) {
  const response = await page.goto(path);

  expect(response).not.toBeNull();
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("body")).toBeVisible();
}

function seekerNav(page: Page) {
  return page.locator('nav[aria-label="Seeker"]');
}

function hostNav(page: Page) {
  return page.locator('nav[aria-label="Host"]');
}

test.describe("shell ownership smoke", () => {
  test("/ renders seeker nav and no host nav", async ({ page }) => {
    await expectRouteToLoad("/", page);

    await expect(seekerNav(page)).toHaveCount(1);
    await expect(seekerNav(page)).toBeVisible();
    await expect(hostNav(page)).toHaveCount(0);
  });

  test("/search resolves into seeker nav and no host nav", async ({ page }) => {
    await expectRouteToLoad("/search", page);

    await expect(seekerNav(page)).toHaveCount(1);
    await expect(seekerNav(page)).toBeVisible();
    await expect(hostNav(page)).toHaveCount(0);
  });

  test("listing detail renders without seeker or host nav", async ({ page }) => {
    await expectRouteToLoad("/listing/sunrise-orchard", page);

    await expect(seekerNav(page)).toHaveCount(0);
    await expect(hostNav(page)).toHaveCount(0);
  });

  test("seeker routes render seeker nav exactly once", async ({ page }) => {
    await expectRouteToLoad("/swipe", page);

    const nav = seekerNav(page);

    await expect(nav).toHaveCount(1);
    await expect(nav).toBeVisible();
    await expect(hostNav(page)).toHaveCount(0);
  });

  test("host routes render host nav exactly once", async ({ page }) => {
    await expectRouteToLoad("/host", page);

    const nav = hostNav(page);

    await expect(nav).toHaveCount(1);
    await expect(nav).toBeVisible();
    await expect(seekerNav(page)).toHaveCount(0);
  });
});