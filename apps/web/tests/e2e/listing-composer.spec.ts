import { expect, test } from "playwright/test";

const BASE = "http://127.0.0.1:3100";

test("host listing composer previews the truthful seeker card as fields change", async ({
  context,
  page,
}) => {
  await context.addCookies([
    { name: "ee_dev_role", value: "host", url: BASE },
  ]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/host/listings/new");

  const preview = page.getByRole("region", { name: "Live listing preview" });
  await expect(preview).toBeVisible();
  await expect(
    page.getByText("Benefit photo slots unlock after the first save."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create draft & continue" }),
  ).toBeVisible();
  await expect(preview.getByText("Untitled opportunity")).toBeVisible();
  await expect(preview.getByText("not confirmed", { exact: true })).toHaveCount(2);
  await expect(
    preview.getByRole("button", { name: "Your organization" }),
  ).toHaveCount(0);

  await page.getByLabel("Title").fill("Coastal Deckhand");
  await page.getByLabel("Location name").fill("Astoria, OR");
  await page.getByLabel("Housing").fill("Private crew cabin");
  await page.getByLabel("Meals").fill("Three meals daily");
  await page.getByLabel("Pay min").fill("185");
  await page.getByLabel("Pay max").fill("220");
  await page.getByLabel("Pay period").selectOption("day");

  await expect(preview.getByText("Coastal Deckhand")).toBeVisible();
  await expect(preview.getByText("Astoria, OR")).toBeVisible();
  await expect(preview.getByText("Private crew cabin")).toBeVisible();
  await expect(preview.getByText("Three meals daily")).toBeVisible();
  await expect(preview.getByText("$185–$220/day")).toBeVisible();
  await expect(preview.getByText("offered", { exact: true })).toHaveCount(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview).toBeVisible();
  const [previewBox, formBox] = await Promise.all([
    preview.boundingBox(),
    page.locator("form").filter({ has: page.getByLabel("Title") }).boundingBox(),
  ]);
  expect(previewBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(previewBox!.y).toBeLessThan(formBox!.y);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBe(390);
});
