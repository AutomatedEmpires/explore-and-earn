import { expect, test, type Locator, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";
const APPLICATION_ID = "dev-application-vineyard-not-selected";
const APPLICATION_PATH = `/applied/${APPLICATION_ID}`;
const UNKNOWN_APPLICATION_PATH = `${APPLICATION_PATH}-unknown`;
const LISTING_ID = "lst_vineyard_napa";
const LISTING_TITLE = "Vineyard Cellar Assistant";
const HOST_NAME = "Stone Hollow Vineyard";
const COVER_MESSAGE =
  "I’m excited to contribute during harvest and bring reliable guest-service experience. I’m comfortable with early starts, hands-on cellar work, and shared team responsibilities throughout the season.";
const TIMELINE_DATES = ["May 12, 2026", "May 15, 2026", "May 20, 2026"] as const;

const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

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

async function expectContained(
  locator: Locator,
  container: Locator,
  label: string,
) {
  const [geometry, containerGeometry] = await Promise.all([
    locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth,
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
      };
    }),
    container.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }),
  ]);

  expect(
    geometry.scrollWidth,
    `${label} has internal horizontal overflow`,
  ).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.left, `${label} starts outside its container`).toBeGreaterThanOrEqual(
    containerGeometry.left - 1,
  );
  expect(geometry.right, `${label} ends outside its container`).toBeLessThanOrEqual(
    containerGeometry.right + 1,
  );
}

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has no rendered box`).not.toBeNull();
  expect(box!.width, `${label} is narrower than 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} is shorter than 44px`).toBeGreaterThanOrEqual(44);
}

async function expectStackedMedia(
  card: Locator,
  frame: Locator,
  content: Locator,
) {
  const [cardBox, frameBox, contentBox] = await Promise.all([
    card.boundingBox(),
    frame.boundingBox(),
    content.boundingBox(),
  ]);

  expect(cardBox, "application card has no rendered box").not.toBeNull();
  expect(frameBox, "application media frame has no rendered box").not.toBeNull();
  expect(contentBox, "application summary has no rendered box").not.toBeNull();

  expect(frameBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
  expect(frameBox!.x + frameBox!.width).toBeLessThanOrEqual(
    cardBox!.x + cardBox!.width,
  );
  expect(Math.abs(frameBox!.x - contentBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(frameBox!.width - contentBox!.width)).toBeLessThanOrEqual(1);
  expect(frameBox!.y + frameBox!.height).toBeLessThanOrEqual(contentBox!.y);
  expect(Math.abs(frameBox!.width / frameBox!.height - 16 / 9)).toBeLessThanOrEqual(
    0.02,
  );
}

test.describe("seeker application detail on phones", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "seeker", url: BASE },
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie_consent", "essential");
    });
  });

  test("keeps the canonical application readable without exposing mutations", async ({
    page,
  }) => {
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
      const response = await page.goto(APPLICATION_PATH);
      expect(response?.ok()).toBeTruthy();
      await expect(page).toHaveURL(`${BASE}${APPLICATION_PATH}`);
      const devBench = page.getByRole("complementary", {
        name: "Dev mock bench",
        exact: true,
      });
      if ((await devBench.count()) > 0) {
        await devBench.evaluate((element) => {
          (element as HTMLElement).style.display = "none";
        });
      }

      const pageTitle = page.getByRole("heading", {
        level: 1,
        name: LISTING_TITLE,
        exact: true,
      });
      const card = page.getByRole("article", {
        name: LISTING_TITLE,
        exact: true,
      });
      const summaryTitle = card.getByRole("heading", {
        level: 2,
        name: LISTING_TITLE,
        exact: true,
      });
      const directSections = card.locator(":scope > div");
      const frame = directSections.nth(0);
      const content = directSections.nth(1);
      const host = card.getByText(HOST_NAME, { exact: true });
      const back = page.getByRole("link", {
        name: "Back to applications",
        exact: true,
      });
      const listing = card.getByRole("link", {
        name: "View listing",
        exact: true,
      });
      const timelineHeading = page.getByRole("heading", {
        level: 3,
        name: "Status timeline",
        exact: true,
      });
      const timeline = timelineHeading.locator("xpath=..");
      const timelineSteps = timeline.getByRole("listitem");
      const noteHeading = page.getByRole("heading", {
        level: 3,
        name: "Your note to the host",
        exact: true,
      });
      const noteSection = noteHeading.locator("xpath=..");
      const note = noteSection.getByText(COVER_MESSAGE, { exact: true });

      await expect(pageTitle).toBeVisible();
      await expect(summaryTitle).toBeVisible();
      await expect(host).toBeVisible();
      await expect(card.getByText("Not selected", { exact: true })).toBeVisible();
      await expect(directSections).toHaveCount(2);
      await expect(back).toHaveAttribute("href", "/applied");
      await expect(listing).toHaveAttribute("href", `/listing/${LISTING_ID}`);
      await expectTouchTarget(back, "Back to applications");
      await expectTouchTarget(listing, "View listing");
      await expect(timelineHeading).toBeVisible();
      await expect(timelineSteps).toHaveCount(3);
      await expect(
        timeline.getByText("Application submitted", { exact: true }),
      ).toBeVisible();
      await expect(
        timeline.getByText("Reviewed by host", { exact: true }),
      ).toBeVisible();
      await expect(
        timeline.getByText("Decision made", { exact: true }),
      ).toBeVisible();
      for (const date of TIMELINE_DATES) {
        await expect(timeline.getByText(date, { exact: true })).toBeVisible();
      }
      await expect(noteHeading).toBeVisible();
      await expect(note).toBeVisible();

      await expectStackedMedia(card, frame, content);
      await expectContained(card, page.locator("body"), "application card");
      await expectContained(frame, card, "application media frame");
      await expectContained(content, card, "application summary");
      await expectContained(summaryTitle, content, "application title");
      await expectContained(host, content, "host name");
      await expectContained(listing, content, "listing action");
      await expectContained(timeline, page.locator("body"), "status timeline");
      for (const [index, step] of (await timelineSteps.all()).entries()) {
        await expectContained(step, timeline, `status timeline step ${index + 1}`);
      }
      await expectContained(noteSection, page.locator("body"), "cover message section");
      await expectContained(note, noteSection, "cover message");
      await expectNoDocumentOverflow(page);

      await expect(
        card.getByRole("button", { name: "Message host", exact: true }),
      ).toHaveCount(0);
      await expect(
        card.getByRole("button", { name: "Withdraw", exact: true }),
      ).toHaveCount(0);
      expect(
        serverActionPosts,
        `application detail sent a Next server action at ${viewport.width}px`,
      ).toEqual([]);
    }
  });

  test("keeps an unknown dev application id unavailable", async ({ page }) => {
    await page.goto(UNKNOWN_APPLICATION_PATH);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "This page isn’t available.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: LISTING_TITLE, exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(COVER_MESSAGE, { exact: true })).toHaveCount(0);
  });
});
