import { expect, test } from "playwright/test";

const BASE = "http://127.0.0.1:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";

test.use({ viewport: { width: 390, height: 844 } });

test("host dashboard keeps incomplete setup actionable and never claims all-clear", async ({
  context,
  page,
}) => {
  await context.addCookies([
    { name: DEV_ROLE_COOKIE, value: "host", url: BASE },
  ]);

  const response = await page.goto("/host");

  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('nav[aria-label="Host"]')).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 1, name: "Host dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Complete profile", exact: true }),
  ).toHaveAttribute("href", "/host/profile/edit");
  await expect(
    page.getByLabel("0 of 3 steps complete"),
  ).toBeVisible();
  await expect(page.getByText("You’re all caught up.")).toHaveCount(0);
});
