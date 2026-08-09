import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";
const PREVIEW_NOTICE = "Preview only — changes on this page are not saved.";
const PREVIEW_SAVED = "Preview updated. No settings were saved.";

const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

async function setRole(context: BrowserContext, role: "seeker" | "host") {
  await context.addCookies([
    { name: DEV_ROLE_COOKIE, value: role, url: BASE },
  ]);
}

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

async function expectNoDocumentOverflow(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const geometry = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
}

async function expectContained(
  locator: Locator,
  container: Locator,
  label: string,
) {
  const [geometry, containerBox] = await Promise.all([
    locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth,
        left: box.left,
        right: box.right,
        scrollWidth: element.scrollWidth,
      };
    }),
    container.boundingBox(),
  ]);
  expect(containerBox, `${label} container has no rendered box`).not.toBeNull();
  expect(
    geometry.scrollWidth,
    `${label} has internal horizontal overflow`,
  ).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(
    geometry.left,
    `${label} starts outside its container`,
  ).toBeGreaterThanOrEqual(
    containerBox!.x - 1,
  );
  expect(
    geometry.right,
    `${label} ends outside its container`,
  ).toBeLessThanOrEqual(containerBox!.x + containerBox!.width + 1);
}

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has no rendered box`).not.toBeNull();
  expect(box!.width, `${label} is narrower than 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} is shorter than 44px`).toBeGreaterThanOrEqual(44);
}

async function expectFormControlsFit(form: Locator, viewportWidth: number) {
  const controls = form.locator("input, select, button");
  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;
    const label =
      (await control.getAttribute("name")) ??
      ((await control.innerText()).trim() || `control ${index + 1}`);
    await expectTouchTarget(control, `${label} at ${viewportWidth}px`);
    await expectContained(control, form, `${label} at ${viewportWidth}px`);
  }
}

async function expectAboveSeekerChrome(page: Page, locator: Locator) {
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" });
  });

  const [target, dock] = await Promise.all([
    locator.boundingBox(),
    page.getByRole("navigation", { name: "Seeker", exact: true }).boundingBox(),
  ]);
  const replay = page.getByRole("button", {
    name: "Replay the quick tour",
    exact: true,
  });
  const replayBox = (await replay.count()) > 0 ? await replay.boundingBox() : null;

  expect(target).not.toBeNull();
  expect(dock).not.toBeNull();
  expect(target!.y + target!.height).toBeLessThanOrEqual(
    Math.min(dock!.y, replayBox?.y ?? Number.POSITIVE_INFINITY) + 1,
  );
}

async function openFixture(page: Page, path: "/schedule" | "/travel") {
  const response = await page.goto(path);
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL(`${BASE}${path}`);
  await hideOptionalDevBench(page);
}

test.describe("seeker schedule and travel settings on phones", () => {
  test.beforeEach(async ({ context, page }) => {
    await setRole(context, "seeker");
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie_consent", "essential");
      window.localStorage.setItem(
        "ee.seeker.coachmarks.v1",
        JSON.stringify({ index: 0, done: true }),
      );
    });
  });

  test("previews both real forms locally without a Server Action POST", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const serverActionPosts: string[] = [];

    // Install the mutation barrier before navigation. A regression may attempt
    // a Server Action, but that request never reaches Next or a provider.
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

      await openFixture(page, "/schedule");
      const schedule = page.getByRole("form", {
        name: "General availability",
        exact: true,
      });
      await expect(schedule).toHaveAttribute("data-dev-fixture", "schedule");
      await expect(schedule).toHaveAttribute("method", "post");
      await expect(schedule.getByRole("note")).toHaveText(PREVIEW_NOTICE);
      const startDate = schedule.getByLabel("Start date", { exact: true });
      const endDate = schedule.getByLabel("End date", { exact: true });
      const status = schedule.getByRole("combobox", {
        name: "Status",
        exact: true,
      });
      const saveAvailability = schedule.getByRole("button", {
        name: "Save availability",
        exact: true,
      });
      await expect(startDate).toHaveValue("");
      await expect(endDate).toHaveValue("");
      await expect(status).toHaveValue("");
      await startDate.fill("2026-09-15");
      await endDate.fill("2026-10-31");
      await status.selectOption("date_range");
      await expectAboveSeekerChrome(page, saveAvailability);
      await saveAvailability.click();
      await expect(schedule.getByRole("status")).toHaveText(PREVIEW_SAVED);
      await expect(schedule.getByRole("alert")).toHaveCount(0);
      await expect(startDate).toHaveValue("2026-09-15");
      await expect(endDate).toHaveValue("2026-10-31");
      await expect(status).toHaveValue("date_range");
      expect(serverActionPosts).toEqual([]);
      await expectFormControlsFit(schedule, viewport.width);
      await expectContained(schedule, page.locator("body"), "schedule form");
      await expectNoDocumentOverflow(page);

      await openFixture(page, "/travel");
      const travel = page.getByRole("form", {
        name: "Travel preferences",
        exact: true,
      });
      await expect(travel).toHaveAttribute("data-dev-fixture", "travel");
      await expect(travel).toHaveAttribute("method", "post");
      await expect(travel.getByRole("note")).toHaveText(PREVIEW_NOTICE);
      const readiness = travel.getByRole("combobox", {
        name: "Travel readiness",
        exact: true,
      });
      const location = travel.getByLabel("Preferred location", { exact: true });
      const saveTravel = travel.getByRole("button", {
        name: "Save travel preferences",
        exact: true,
      });
      await expect(readiness).toHaveValue("");
      await expect(location).toHaveValue("");
      await readiness.selectOption("willing_to_travel");
      await location.fill("Pacific Northwest");
      await expectAboveSeekerChrome(page, saveTravel);
      await saveTravel.click();
      await expect(travel.getByRole("status")).toHaveText(PREVIEW_SAVED);
      await expect(travel.getByRole("alert")).toHaveCount(0);
      await expect(readiness).toHaveValue("willing_to_travel");
      await expect(location).toHaveValue("Pacific Northwest");
      expect(serverActionPosts).toEqual([]);
      await expectFormControlsFit(travel, viewport.width);
      await expectContained(travel, page.locator("body"), "travel form");
      await expectNoDocumentOverflow(page);
    }

    // The preview is deliberately local to the rendered page. Reloading must
    // restore the explicit persisted fixture truth instead of implying a write.
    await page.reload();
    await hideOptionalDevBench(page);
    const reloadedTravel = page.getByRole("form", {
      name: "Travel preferences",
      exact: true,
    });
    await expect(
      reloadedTravel.getByRole("combobox", {
        name: "Travel readiness",
        exact: true,
      }),
    ).toHaveValue("");
    await expect(
      reloadedTravel.getByLabel("Preferred location", { exact: true }),
    ).toHaveValue("");
    await expect(reloadedTravel.getByRole("status")).toHaveCount(0);
    expect(serverActionPosts).toEqual([]);
  });

  test("never exposes seeker preview fixtures to the host dev role", async ({
    context,
    page,
  }) => {
    await setRole(context, "host");
    await page.setViewportSize(PHONE_VIEWPORTS[0]);

    for (const path of ["/schedule", "/travel"] as const) {
      const response = await page.goto(path);
      expect(response).not.toBeNull();
      expect(
        response!.ok(),
        `${path} did not load for the host dev role`,
      ).toBeTruthy();
      await expect(page.locator("[data-dev-fixture]")).toHaveCount(0);
      await expect(page.getByText(PREVIEW_NOTICE, { exact: true })).toHaveCount(0);
      await expect(page.getByText(PREVIEW_SAVED, { exact: true })).toHaveCount(0);
    }
  });
});
