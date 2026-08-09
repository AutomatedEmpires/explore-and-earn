import { expect, test, type Locator, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";
const RESUME_PATH = "/resume";
const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

const SAVE_FAILURE = "We couldn’t save your changes. Try again.";
const OPEN_EDITOR_WARNING =
  "Save or cancel the open entry before moving to another step.";

async function hideOptionalDevBench(page: Page) {
  const devBench = page.getByRole("complementary", {
    name: "Dev mock bench",
    exact: true,
  });
  if ((await devBench.count()) > 0) {
    await devBench.evaluate((element) => {
      (element as HTMLElement).style.display = "none";
    });
  }
}

async function openResume(page: Page) {
  const response = await page.goto(RESUME_PATH);
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL(`${BASE}${RESUME_PATH}`);
  await hideOptionalDevBench(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Resume", exact: true }),
  ).toBeVisible();
}

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

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has no rendered box`).not.toBeNull();
  expect(box!.width, `${label} is narrower than 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} is shorter than 44px`).toBeGreaterThanOrEqual(44);
}

async function expectVisibleBuilderButtonsAreTouchTargets(
  builder: Locator,
  viewportWidth: number,
) {
  const buttons = builder.getByRole("button");
  for (let index = 0; index < (await buttons.count()); index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible())) continue;
    const ariaLabel = await button.getAttribute("aria-label");
    const visibleText = (await button.innerText()).trim();
    const label = ariaLabel || visibleText || `button ${index + 1}`;
    await expectTouchTarget(button, `${label} at ${viewportWidth}px`);
  }
}

async function expectFooterClearsSeekerDock(page: Page, footer: Locator) {
  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight });
  });
  await expect(footer).toBeVisible();

  const [footerBox, dockBox] = await Promise.all([
    footer.boundingBox(),
    page
      .getByRole("navigation", { name: "Seeker", exact: true })
      .boundingBox(),
  ]);
  expect(footerBox, "resume footer has no rendered box").not.toBeNull();
  expect(dockBox, "fixed seeker dock has no rendered box").not.toBeNull();
  expect(
    footerBox!.y + footerBox!.height,
    "resume footer overlaps the fixed seeker dock",
  ).toBeLessThanOrEqual(dockBox!.y + 1);
}

function resumeControls(page: Page) {
  const progress = page.getByRole("progressbar", {
    name: "Resume completion",
    exact: true,
  });
  return {
    progress,
    builder: page.getByRole("region", {
      name: "Resume builder",
      exact: true,
    }),
    rail: page.getByRole("navigation", {
      name: "Resume builder steps",
      exact: true,
    }),
    footer: page.getByRole("navigation", {
      name: "Resume step actions",
      exact: true,
    }),
  };
}

test.describe("resume save and navigation on phones", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "seeker", url: BASE },
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie_consent", "essential");
      window.localStorage.setItem(
        "ee.seeker.coachmarks.v1",
        JSON.stringify({ index: 0, done: true }),
      );
    });
  });

  test("keeps unsaved work on its source step without touching a provider", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const serverActionPosts: string[] = [];

    // Install the mutation barrier before the first navigation. A regression may
    // attempt a Server Action, but the request never reaches Next, a database, or
    // another provider.
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        serverActionPosts.push(request.url());
        await route.abort();
        return;
      }
      await route.continue();
    });

    for (const viewport of PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);

      // A pristine Info step has nothing to save and may move without a POST.
      await openResume(page);
      let { builder, footer, progress, rail } = resumeControls(page);
      await expect(progress).toHaveAttribute("aria-valuenow", "0");
      await rail
        .getByRole("button", { name: "Step 2: Experience", exact: true })
        .click();
      await expect(
        rail.getByRole("button", {
          name: "Step 2: Experience",
          exact: true,
        }),
      ).toHaveAttribute("aria-current", "step");
      expect(serverActionPosts).toEqual([]);
      await expectNoDocumentOverflow(page);

      // Dirty Info must try exactly one save before navigation. The forced
      // network failure leaves the edit, step, and persisted completion intact.
      await openResume(page);
      ({ builder, footer, progress, rail } = resumeControls(page));
      const fullName = page.getByRole("textbox", {
        name: "Full name",
        exact: true,
      });
      const initialCompletion = await progress.getAttribute("aria-valuenow");
      await fullName.fill(`Mobile save probe ${viewport.width}`);
      await footer
        .getByRole("button", { name: "Save & continue", exact: true })
        .click();

      await expect.poll(() => serverActionPosts.length).toBe(1);
      await expect(builder.getByRole("alert")).toHaveText(SAVE_FAILURE);
      await expect(
        rail.getByRole("button", { name: "Step 1: Info", exact: true }),
      ).toHaveAttribute("aria-current", "step");
      await expect(
        rail.getByRole("button", {
          name: "Step 1: Info (done)",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(progress).toHaveAttribute(
        "aria-valuenow",
        initialCompletion ?? "0",
      );
      await expect(fullName).toHaveValue(`Mobile save probe ${viewport.width}`);
      expect(serverActionPosts).toHaveLength(1);
      await expectTouchTarget(fullName, `Full name at ${viewport.width}px`);
      await expectVisibleBuilderButtonsAreTouchTargets(builder, viewport.width);
      await expectFooterClearsSeekerDock(page, footer);
      await expectNoDocumentOverflow(page);

      // Opening an inline Experience editor creates a local draft. Both the rail
      // and footer must refuse to abandon it, and neither path may issue a POST.
      serverActionPosts.length = 0;
      await openResume(page);
      ({ builder, footer, progress, rail } = resumeControls(page));
      await rail
        .getByRole("button", { name: "Step 2: Experience", exact: true })
        .click();
      await page.getByRole("button", { name: "Add", exact: true }).click();
      const roleTitle = page.getByRole("textbox", {
        name: "Role title",
        exact: true,
      });
      await roleTitle.fill(`Unsaved guide ${viewport.width}`);

      await rail
        .getByRole("button", { name: "Step 3: Education", exact: true })
        .click();
      await expect(builder.getByRole("alert")).toHaveText(OPEN_EDITOR_WARNING);
      await expect(
        rail.getByRole("button", {
          name: "Step 2: Experience",
          exact: true,
        }),
      ).toHaveAttribute("aria-current", "step");
      await expect(roleTitle).toHaveValue(`Unsaved guide ${viewport.width}`);
      expect(serverActionPosts).toEqual([]);

      await footer.getByRole("button", { name: /continue$/i }).click();
      await expect(builder.getByRole("alert")).toHaveText(OPEN_EDITOR_WARNING);
      await expect(
        rail.getByRole("button", {
          name: "Step 2: Experience",
          exact: true,
        }),
      ).toHaveAttribute("aria-current", "step");
      await expect(roleTitle).toHaveValue(`Unsaved guide ${viewport.width}`);
      expect(serverActionPosts).toEqual([]);

      await expectTouchTarget(roleTitle, `Role title at ${viewport.width}px`);
      await expectVisibleBuilderButtonsAreTouchTargets(builder, viewport.width);
      await expectFooterClearsSeekerDock(page, footer);
      await expectNoDocumentOverflow(page);

      // A typed custom skill is also local work until the seeker presses Add.
      // Navigation must block until that draft is explicitly added or cleared.
      await openResume(page);
      ({ builder, footer, progress, rail } = resumeControls(page));
      await rail
        .getByRole("button", {
          name: "Step 4: Certs & Skills",
          exact: true,
        })
        .click();
      const customSkill = builder.getByPlaceholder("Add custom skill…", {
        exact: true,
      });
      await customSkill.fill(`Guest care ${viewport.width}`);
      await rail
        .getByRole("button", { name: "Step 5: Review", exact: true })
        .click();
      await expect(builder.getByRole("alert")).toHaveText(OPEN_EDITOR_WARNING);
      await expect(
        rail.getByRole("button", {
          name: "Step 4: Certs & Skills",
          exact: true,
        }),
      ).toHaveAttribute("aria-current", "step");
      await expect(customSkill).toHaveValue(`Guest care ${viewport.width}`);
      expect(serverActionPosts).toEqual([]);

      const clearDraft = builder.getByRole("button", {
        name: "Clear",
        exact: true,
      });
      await expectTouchTarget(customSkill, `Custom skill at ${viewport.width}px`);
      await expectTouchTarget(clearDraft, `Clear skill at ${viewport.width}px`);
      await clearDraft.click();
      await rail
        .getByRole("button", { name: "Step 5: Review", exact: true })
        .click();
      await expect(
        rail.getByRole("button", { name: "Step 5: Review", exact: true }),
      ).toHaveAttribute("aria-current", "step");
      expect(serverActionPosts).toEqual([]);
      await expectNoDocumentOverflow(page);
    }
  });
});
