import { expect, test, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";

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

test.describe("admin command search", () => {
  test("keeps the hosts query truthful and URL-synchronized on phones", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "admin", url: BASE },
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie_consent", "essential");
    });

    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const response = await page.goto("/hosts?page=2&q=Juniper");
      expect(response?.ok()).toBeTruthy();

      const search = page
        .getByRole("search")
        .getByRole("searchbox", {
          name: "Search hosts on this page by company, reference, verification, or listing count",
          exact: true,
        });
      await expect(search).toBeVisible();
      await expect(search).toHaveAttribute(
        "placeholder",
        "Search this hosts page",
      );
      await expect(search).toHaveAttribute("maxlength", "120");
      await expect(search).toHaveValue("Juniper");
      await expect(page.locator("[data-risk]")).toHaveCount(1);
      await expect(page.getByText("Juniper Wake", { exact: true })).toBeVisible();
      await expect(
        page.getByText("1 of 1 hosts on this page", { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Prev" })).toHaveAttribute(
        "href",
        "/hosts?q=Juniper",
      );

      const box = await search.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);

      await page.getByRole("heading", { name: "Host verification" }).click();
      await page.keyboard.press("/");
      await expect(search).toBeFocused();
      await search.fill("Coastal & Crew");
      await search.press("Enter");

      await expect
        .poll(() => {
          const url = new URL(page.url());
          return {
            pathname: url.pathname,
            query: url.searchParams.get("q"),
            page: url.searchParams.get("page"),
          };
        })
        .toEqual({
          pathname: "/hosts",
          query: "Coastal & Crew",
          page: null,
        });
      await expect(search).toHaveValue("Coastal & Crew");
      await expect(page.locator("[data-risk]")).toHaveCount(1);
      await expect(
        page.getByText("Coastal & Crew", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("North Star Lodge", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("1 of 2 hosts on this page", { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Next" })).toHaveAttribute(
        "href",
        "/hosts?q=Coastal+%26+Crew&page=2",
      );
      await expectNoHorizontalOverflow(page);

      await page
        .getByRole("button", { name: "Awaiting 1", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "No hosts on this page match these filters",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Try a different search or trust-review filter.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator("[data-risk]")).toHaveCount(0);
      await page.getByRole("button", { name: "All 2", exact: true }).click();
      await expect(page.locator("[data-risk]")).toHaveCount(1);

      await page.goBack();
      await expect
        .poll(() => {
          const url = new URL(page.url());
          return {
            pathname: url.pathname,
            query: url.searchParams.get("q"),
            page: url.searchParams.get("page"),
          };
        })
        .toEqual({ pathname: "/hosts", query: "Juniper", page: "2" });
      await expect(search).toHaveValue("Juniper");
      await expect(page.locator("[data-risk]")).toHaveCount(1);
      await expect(page.getByText("Juniper Wake", { exact: true })).toBeVisible();

      await search.fill("user_dev_northstar_8k2m");
      await search.press("Enter");
      await expect(
        page.getByRole("heading", {
          name: "No hosts on this page match this search",
        }),
      ).toBeVisible();
      await expect(page.locator("[data-risk]")).toHaveCount(0);

      await search.fill("hidden-dev-fixture-reason");
      await search.press("Enter");
      await expect(
        page.getByRole("heading", {
          name: "No hosts on this page match this search",
        }),
      ).toBeVisible();
      await expect(page.locator("[data-risk]")).toHaveCount(0);
      await page.getByRole("button", { name: "Clear filters" }).click();
      await expect(page).toHaveURL(`${BASE}/hosts`);
      await expect(search).toHaveValue("");
      await expect(page.locator("[data-risk]")).toHaveCount(2);

      await search.fill("Spam reports · flagged");
      await search.press("Enter");
      await expect(page.locator("[data-risk]")).toHaveCount(1);
      await expect(
        page.getByText("North Star Lodge", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Spam reports · flagged", { exact: true }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
