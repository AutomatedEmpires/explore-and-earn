import { expect, test, type Page } from "playwright/test";

const BASE = "http://localhost:3100";

function housingEvidence(page: Page) {
  return page.locator('section[aria-labelledby="housing-evidence-title"]');
}

test.describe("public housing evidence", () => {
  test("shows the four generic roles in contract order", async ({ page }) => {
    await page.goto("/listing/lst_orchard_wenatchee");
    const evidence = housingEvidence(page);

    await expect(evidence.locator("figcaption")).toHaveText([
      "Sleeping area",
      "Bathroom",
      "Kitchen",
      "Dining/common area",
    ]);
    await expect(evidence.getByRole("img")).toHaveCount(4);
    for (const name of [
      "Sleeping area provided by the host",
      "Bathroom provided by the host",
      "Kitchen provided by the host",
      "Dining/common area provided by the host",
    ]) {
      await expect(evidence.getByRole("img", { name, exact: true })).toHaveCount(1);
    }
  });

  test("adapts the same four roles for maritime listings", async ({ page }) => {
    await page.goto("/listing/lst_deckhand_sitka");
    const evidence = housingEvidence(page);

    await expect(evidence.locator("figcaption")).toHaveText([
      "Cabin/berth",
      "Head",
      "Galley",
      "Mess",
    ]);
    await expect(evidence.getByRole("img")).toHaveCount(4);
    for (const name of [
      "Cabin/berth provided by the host",
      "Head provided by the host",
      "Galley provided by the host",
      "Mess provided by the host",
    ]) {
      await expect(evidence.getByRole("img", { name, exact: true })).toHaveCount(1);
    }
  });

  test("suppresses photo evidence when housing is absent or the listing is sourced", async ({
    page,
  }) => {
    await page.goto("/listing/lst_remote_community");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Remote Community Manager",
        exact: true,
      }),
    ).toBeVisible();
    await expect(housingEvidence(page)).toHaveCount(0);

    await page.goto("/listing/lst_sourced_kelp_farm");
    await expect(
      page.getByRole("region", { name: "Sourced listing notice", exact: true }),
    ).toBeVisible();
    await expect(housingEvidence(page)).toHaveCount(0);
  });
});

test.describe("host housing library", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "ee_dev_role", value: "host", url: BASE },
    ]);
  });

  test("renders four usable upload slots without mobile overflow", async ({ page }) => {
    await page.goto("/host/profile/edit");
    await expect(
      page.getByRole("heading", { level: 2, name: "Edit profile", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Reusable housing photos", { exact: true })).toBeVisible();
    await expect(page.getByText("Uploads auto-save", { exact: true })).toBeVisible();
    await expect(page.getByText("0/4 complete", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Discard unsaved changes", exact: true }),
    ).toBeVisible();

    const buttons = page.getByRole("button", {
      name: /^Upload (sleeping area|bathroom|kitchen|dining\/common area)$/,
    });
    await expect(buttons).toHaveCount(4);
    const boxes = await buttons.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          disabled: (node as HTMLButtonElement).disabled,
        };
      }),
    );
    expect(boxes.every((box) => box.width > 0 && box.height > 0)).toBe(true);
    expect(boxes.every((box) => !box.disabled)).toBe(true);

    for (let index = 1; index < boxes.length; index += 1) {
      expect(Math.abs(boxes[index].x - boxes[0].x)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxes[index].width - boxes[0].width)).toBeLessThanOrEqual(2);
      expect(boxes[index].y).toBeGreaterThan(
        boxes[index - 1].y + boxes[index - 1].height,
      );
    }
    const viewport = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      width: window.innerWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);
  });
});
