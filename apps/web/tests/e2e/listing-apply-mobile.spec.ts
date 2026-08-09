import { expect, test, type Locator, type Page } from "playwright/test";

const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

const LISTING_PATH = "/listing/lst_orchard_wenatchee";
const LISTING_TITLE = "Orchard Harvest Hand";
const DIALOG_HEADING = "Preview the application flow?";
const MODAL_GUTTER = 16;

async function expectModalContained(
  page: Page,
  surface: Locator,
  baselineDocumentWidth: number,
) {
  await page.evaluate(() => document.fonts.ready);

  const geometry = await surface.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bodyWidth: document.body.scrollWidth,
      clientWidth: element.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      left: rect.left,
      right: rect.right,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(geometry.left, "modal loses its left phone gutter").toBeGreaterThanOrEqual(
    MODAL_GUTTER,
  );
  expect(
    geometry.viewportWidth - geometry.right,
    "modal loses its right phone gutter",
  ).toBeGreaterThanOrEqual(MODAL_GUTTER);
  expect(
    geometry.scrollWidth,
    "modal surface has internal horizontal overflow",
  ).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.bodyWidth, "body overflows the phone viewport").toBeLessThanOrEqual(
    geometry.viewportWidth,
  );
  expect(
    geometry.documentWidth,
    "opening the modal increases the page's horizontal extent",
  ).toBeLessThanOrEqual(
    Math.max(baselineDocumentWidth, geometry.viewportWidth),
  );
}

async function expectContainedTouchTarget(
  target: Locator,
  surface: Locator,
  label: string,
) {
  const [targetBox, surfaceBox] = await Promise.all([
    target.boundingBox(),
    surface.boundingBox(),
  ]);

  expect(targetBox, `${label} has no rendered box`).not.toBeNull();
  expect(surfaceBox, "modal surface has no rendered box").not.toBeNull();
  expect(targetBox!.width, `${label} is narrower than 44px`).toBeGreaterThanOrEqual(
    44,
  );
  expect(targetBox!.height, `${label} is shorter than 44px`).toBeGreaterThanOrEqual(
    44,
  );
  expect(targetBox!.x, `${label} starts outside the modal`).toBeGreaterThanOrEqual(
    surfaceBox!.x,
  );
  expect(
    targetBox!.x + targetBox!.width,
    `${label} ends outside the modal`,
  ).toBeLessThanOrEqual(surfaceBox!.x + surfaceBox!.width);
}

test.describe("listing apply modal on phones", () => {
  test("stays contained and closes without sending an application", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie_consent", "essential");
    });

    const serverActionPosts: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.headers()["next-action"]
      ) {
        serverActionPosts.push(request.url());
      }
    });

    for (const viewport of PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      const response = await page.goto(LISTING_PATH);
      expect(response?.ok()).toBeTruthy();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: LISTING_TITLE,
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("complementary", {
          name: "Dev mock bench",
          exact: true,
        })
        .evaluate((element) => {
          (element as HTMLElement).style.display = "none";
        });
      const baselineDocumentWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );

      const apply = page.getByRole("button", { name: "Apply", exact: true });
      await expect(apply).toBeVisible();
      await apply.click();

      const dialog = page.getByRole("dialog", {
        name: DIALOG_HEADING,
        exact: true,
      });
      const surface = dialog.locator(".ui-modal__surface");
      const confirm = dialog.getByRole("button", {
        name: "Confirm",
        exact: true,
      });
      const cancel = dialog.getByRole("button", {
        name: "Cancel",
        exact: true,
      });

      await expect(dialog).toBeVisible();
      await expect(confirm).toBeFocused();
      await expectModalContained(page, surface, baselineDocumentWidth);
      await expectContainedTouchTarget(confirm, surface, "Confirm");
      await expectContainedTouchTarget(cancel, surface, "Cancel");

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(apply).toBeFocused();

      await apply.click();
      await expect(dialog).toBeVisible();
      await cancel.click();
      await expect(dialog).toHaveCount(0);
      await expect(apply).toBeFocused();
      expect(
        serverActionPosts,
        `phone apply preview sent a Next server action at ${viewport.width}px`,
      ).toEqual([]);
    }
  });
});
