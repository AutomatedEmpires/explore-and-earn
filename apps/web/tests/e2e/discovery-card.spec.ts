import { expect, test } from "playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("search loads its token-driven route styles", async ({ page }) => {
  const response = await page.goto("/search");
  expect(response?.ok()).toBeTruthy();

  await expect(
    page.getByRole("heading", { level: 1, name: "Search opportunities" }),
  ).toBeVisible();
  await expect(page.locator(".ee-search")).toHaveCSS("display", "grid");
  await expect(page.locator("#ee-search-query")).toHaveCSS(
    "border-radius",
    "10px",
  );
  await expect(page.getByText(/% match/i)).toHaveCount(0);
});

test("search participates in the Seek navigation lane", async ({ page }) => {
  const response = await page.goto("/search");
  expect(response?.ok()).toBeTruthy();

  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Seek" }),
  ).toHaveAttribute("aria-current", "page");
});

test("search composes filters beside results on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const response = await page.goto("/search");
  expect(response?.ok()).toBeTruthy();

  const filters = await page.locator(".ee-search__header").boundingBox();
  const categories = await page
    .getByRole("group", { name: "Filter by category" })
    .boundingBox();
  const search = await page.locator(".ee-search").boundingBox();
  const results = await page.locator(".ee-search__results").boundingBox();

  expect(filters).not.toBeNull();
  expect(categories).not.toBeNull();
  expect(search).not.toBeNull();
  expect(results).not.toBeNull();
  expect(results!.x).toBeGreaterThan(filters!.x + filters!.width);
  expect(categories!.y).toBeLessThan(filters!.y + filters!.height + 64);
  expect(search!.x + search!.width).toBeLessThanOrEqual(1024);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1024);
});

test("search cards preserve not-provided benefit truth and static semantics", async ({
  page,
}) => {
  const response = await page.goto("/search");
  expect(response?.ok()).toBeTruthy();

  const card = page
    .locator("article")
    .filter({ hasText: "Remote Community Manager" });

  await expect(card).toBeVisible();
  await expect(card.getByText("Not included", { exact: true })).toHaveCount(2);
  await expect(card.locator('[data-icon="system.error"]')).toHaveCount(2);
  await expect(card.getByText("not offered", { exact: true })).toHaveCount(2);
  await expect(
    card.locator('div[aria-label^="Housing"], div[aria-label^="Meals"]'),
  ).toHaveCount(0);
});

test("fixture search results open their canonical listing detail", async ({ page }) => {
  const response = await page.goto("/search?q=Remote%20Community%20Manager");
  expect(response?.ok()).toBeTruthy();

  const card = page
    .locator("article")
    .filter({ hasText: "Remote Community Manager" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Remote · Worldwide", { exact: true })).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Remote · Worldwide" }),
  ).toHaveCount(0);
  await card.getByRole("button", { name: /quick apply/i }).click();

  await expect(page).toHaveURL(/\/listing\/lst_remote_community$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Remote Community Manager" }),
  ).toBeVisible();

  const unavailableHousing = page.locator(
    '[data-benefit-kind="housing"][data-provision="not_provided"]',
  );
  await expect(unavailableHousing).toBeVisible();
  const [actualBackground, expectedBackground] = await unavailableHousing.evaluate(
    (element) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--status-error-bg)";
      document.body.append(probe);
      const result = [
        getComputedStyle(element).backgroundColor,
        getComputedStyle(probe).backgroundColor,
      ];
      probe.remove();
      return result;
    },
  );
  expect(actualBackground).toBe(expectedBackground);
});

test("listing detail keeps confirmed benefit exploration contextual", async ({
  page,
}) => {
  const response = await page.goto("/listing/lst_orchard_wenatchee");
  expect(response?.ok()).toBeTruthy();

  const housing = page.getByRole("button", { name: /Housing: offered/i });
  const pay = page.getByRole("button", { name: /^Pay/i });
  await expect(housing).toBeVisible();
  await housing.click();
  await expect(page.getByRole("dialog", { name: "Housing" })).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(pay).toBeVisible();
  await pay.click();
  await expect(page.getByRole("dialog", { name: "Pay snapshot" })).toBeVisible();
  await expect(page).toHaveURL(/\/listing\/lst_orchard_wenatchee$/);
});

test("search card benefits open the shared contextual overlays", async ({ page }) => {
  const response = await page.goto("/search?q=Orchard%20Harvest%20Hand");
  expect(response?.ok()).toBeTruthy();

  const card = page
    .locator("article")
    .filter({ hasText: "Orchard Harvest Hand" });
  const housing = card.getByRole("button", { name: /Housing: offered/i });
  const pay = card.getByRole("button", { name: /^Pay/i });

  await expect(housing).toBeVisible();
  await housing.click();
  const housingDialog = page.getByRole("dialog", { name: "Housing" });
  await expect(housingDialog).toBeVisible();
  await housingDialog.getByRole("button", { name: "Got it" }).click();
  await expect(housingDialog).toBeHidden();

  await expect(pay).toBeVisible();
  await pay.click();
  await expect(page.getByRole("dialog", { name: "Pay snapshot" })).toBeVisible();
});

test("homepage card benefits stay in context", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();

  const card = page
    .locator("article")
    .filter({ hasText: "Orchard Harvest Hand" });
  await card.getByRole("button", { name: /Housing: offered/i }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog", { name: "Housing" })).toBeVisible();
});

test("seek exposes only truth-backed benefit and Map actions", async ({ page }) => {
  const response = await page.goto("/seek");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByText(/% match/i)).toHaveCount(0);

  const remote = page
    .locator("article")
    .filter({ hasText: "Remote Community Manager" });
  const orchard = page
    .locator("article")
    .filter({ hasText: "Orchard Harvest Hand" });

  await expect(remote).toBeVisible();
  await expect(remote.getByRole("button", { name: /Housing:/i })).toHaveCount(0);
  await expect(
    remote.getByRole("button", { name: "Remote · Worldwide" }),
  ).toHaveCount(0);

  const orchardLocation = orchard.getByRole("button", {
    name: "Wenatchee, Washington",
  });
  const orchardHousing = orchard.getByRole("button", {
    name: /Housing: offered/i,
  });
  await expect(orchardLocation).toBeVisible();
  await expect(orchardHousing).toBeVisible();
  await orchardHousing.click();
  const dialog = page.getByRole("dialog", { name: "Housing" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("EXTERIOR", { exact: true })).toBeVisible();
  await expect(dialog.getByText("INTERIOR", { exact: true })).toBeVisible();
  await expect(dialog.getByText("BATHROOM", { exact: true })).toBeVisible();
  await expect(dialog.getByText("OTHER VIEW", { exact: true })).toBeVisible();
  // This harness deliberately has no public Supabase configuration. A failed
  // public detail read must remain distinguishable from a successful empty map.
  await expect(
    dialog.getByText("Details unavailable", { exact: true }),
  ).toHaveCount(4);
  await expect(
    dialog.getByText("Benefit details are temporarily unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
});
