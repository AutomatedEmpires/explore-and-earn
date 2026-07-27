import { expect, test, type Page } from "playwright/test";

const BASE = "http://localhost:3100";

function housingEvidence(page: Page) {
  return page.locator('section[aria-labelledby="housing-evidence-title"]');
}

/**
 * COVERAGE NOTE (2026-07-27, image-CDN removal).
 *
 * Two tests used to live here: "shows the four generic roles in contract order"
 * and "adapts the same four roles for maritime listings". They drove the
 * rendered evidence section off DEV FIXTURE photos, and those fixtures were
 * curated stock images served by an image CDN this product no longer uses. With
 * the provider gone we hold no replacement bytes, and pointing the fixtures at
 * storage objects that do not exist would have kept these tests green off
 * fabricated URLs — a test passing on a photo nobody can load is worse than no
 * test. So the fixtures were emptied and those two tests were removed.
 *
 * What they actually protected — the fixed role order and the per-category
 * label vocabulary (Sleeping area/Bathroom/Kitchen/Dining-common vs
 * Cabin/berth/Head/Galley/Mess) — is pinned at the contract level and runs on
 * every `pnpm test`: packages/db/tests/housingPhotoLibrary.test.ts, over
 * HOUSING_PHOTO_ROLES + housingPhotoLabel(). The resolver's
 * profile-defaults-then-listing-overrides precedence is pinned there too.
 *
 * What is NOT covered right now is the DOM rendering of the evidence section
 * with real photos present. Restore it by seeding the `site-photos` bucket
 * (scripts/seed-site-photos.mjs) or by pointing the fixtures at real uploaded
 * objects — then re-add the two role-order tests above them.
 */
test.describe("public housing evidence", () => {
  test("renders no evidence section when a listing has no housing photos", async ({
    page,
  }) => {
    // NOTE: with fixture media removed this now holds for EVERY fixture, so it
    // no longer distinguishes "housing absent / listing sourced" from "no
    // photos uploaded". It still guards the thing that would actually hurt a
    // user — a broken or empty evidence frame rendering where there is nothing
    // to show — but do not read it as proof of the suppression rule. That rule
    // is the resolver's, and it is unit-tested.
    await page.goto("/listing/lst_orchard_wenatchee");
    await expect(
      page.getByRole("heading", { level: 1, name: "Orchard Harvest Hand", exact: true }),
    ).toBeVisible();
    await expect(housingEvidence(page)).toHaveCount(0);

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
