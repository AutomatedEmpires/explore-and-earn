import { expect, test, type Locator, type Page } from "playwright/test";

async function openHousingSheet(page: Page) {
  await page.goto("/search?q=Orchard%20Harvest%20Hand");
  const trigger = page
    .locator("article")
    .filter({ hasText: "Orchard Harvest Hand" })
    .getByRole("button", { name: /Housing: offered/i });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Housing" });
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  return { trigger, dialog };
}

async function translateY(locator: Locator) {
  return locator.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
  });
}

test("mobile PopupShell is a bottom sheet with a complete close lifecycle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { trigger, dialog } = await openHousingSheet(page);

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeLessThanOrEqual(1);
  expect(box!.width).toBeGreaterThanOrEqual(389);
  expect(Math.abs(box!.y + box!.height - 844)).toBeLessThanOrEqual(1);
  await expect(dialog.locator("[data-popup-drag-handle]")).toBeVisible();
  await expect(dialog).toHaveCSS("border-bottom-left-radius", "0px");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await dialog
    .getByRole("button", { name: "Close housing details" })
    .click();
  await expect(dialog).toHaveAttribute("data-state", "closing");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("desktop PopupShell remains a centered dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const { dialog } = await openHousingSheet(page);
  const box = await dialog.boundingBox();

  expect(box).not.toBeNull();
  expect(Math.abs(box!.x + box!.width / 2 - 512)).toBeLessThanOrEqual(2);
  expect(Math.abs(box!.y + box!.height / 2 - 384)).toBeLessThanOrEqual(2);
  await expect(dialog.locator("[data-popup-drag-handle]")).toBeHidden();
});

test("mobile drag handle snaps a partial drag back without replaying entry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog } = await openHousingSheet(page);
  const handle = dialog.locator("[data-popup-drag-handle]");
  const box = await handle.boundingBox();

  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 48, { steps: 4 });
  const draggedOffset = await translateY(dialog);
  expect(draggedOffset).toBeGreaterThanOrEqual(40);
  await page.mouse.up();

  const largestOffsetAfterRelease = await dialog.evaluate(async (element) => {
    let largestOffset = 0;
    for (let frame = 0; frame < 6; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const transform = getComputedStyle(element).transform;
      const offset =
        transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
      largestOffset = Math.max(largestOffset, offset);
    }
    return largestOffset;
  });

  expect(largestOffsetAfterRelease).toBeLessThanOrEqual(draggedOffset + 12);
  await expect(dialog).toHaveAttribute("data-state", "open");
  await expect.poll(() => translateY(dialog)).toBeLessThanOrEqual(1);
  await expect(dialog).toBeVisible();
});

test("mobile drag handle dismisses after a deliberate downward swipe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog } = await openHousingSheet(page);
  const handle = dialog.locator("[data-popup-drag-handle]");
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();

  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 140, { steps: 6 });
  await page.mouse.up();

  await expect(dialog).toHaveAttribute("data-state", "closing");
  await expect(dialog).toBeHidden();
});

test("reduced motion closes immediately and restores the trigger", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const { trigger, dialog } = await openHousingSheet(page);

  expect(
    await page.evaluate(() =>
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  const closeAnimationDurationMs = await dialog.evaluate((element) => {
    const close = element.querySelector<HTMLButtonElement>(
      'button[aria-label="Close housing details"]',
    );
    if (!close) throw new Error("PopupShell close button was not found");

    return new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("PopupShell close animation did not start")),
        1_000,
      );
      const handleAnimationStart = (event: AnimationEvent) => {
        if (event.target !== element) return;
        window.clearTimeout(timeout);
        element.removeEventListener("animationstart", handleAnimationStart);
        const duration = getComputedStyle(element).animationDuration
          .split(",")[0]
          .trim();
        resolve(
          duration.endsWith("ms")
            ? Number.parseFloat(duration)
            : Number.parseFloat(duration) * 1_000,
        );
      };
      element.addEventListener("animationstart", handleAnimationStart);
      close.click();
    });
  });

  expect(closeAnimationDurationMs).toBeLessThanOrEqual(1);
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
