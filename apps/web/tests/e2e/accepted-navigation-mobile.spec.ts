import { expect, test, type Locator, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";
const ACCEPTED_PATH = "/accepted";
const APPLICATION_ID = "dev-application-ski-resort-accepted";
const APPLICATION_PATH = `/applied/${APPLICATION_ID}`;
const LISTING_ID = "lst_ski_resort_breck";
const LISTING_TITLE = "Ski Resort Front Desk";
const LISTING_START = "Nov 14, 2026";
const DEPARTURE_DATE = "November 14, 2026";

const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

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

async function expectClickableAboveSeekerChrome(page: Page, locator: Locator) {
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" });
  });

  const [target, dock, coachmarkLauncher] = await Promise.all([
    locator.boundingBox(),
    page.getByRole("navigation", { name: "Seeker", exact: true }).boundingBox(),
    page.getByRole("button", { name: "Replay the quick tour", exact: true }).boundingBox(),
  ]);

  expect(target).not.toBeNull();
  expect(dock).not.toBeNull();
  expect(coachmarkLauncher).not.toBeNull();
  expect(target!.y + target!.height).toBeLessThanOrEqual(
    Math.min(dock!.y, coachmarkLauncher!.y),
  );
}

test.describe("accepted application navigation on phones", () => {
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

  test("opens the accepted application detail without firing a mutation", async ({
    page,
  }) => {
    const serverActionPosts: string[] = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        request.method() === "POST" &&
        request.headers()["next-action"]
      ) {
        serverActionPosts.push(request.url());
        await route.abort();
        return;
      }

      await route.continue();
    });

    for (const viewport of PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      const response = await page.goto(ACCEPTED_PATH);
      expect(response?.ok()).toBeTruthy();
      await expect(page).toHaveURL(`${BASE}${ACCEPTED_PATH}`);
      await hideOptionalDevBench(page);

      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Accepted",
          exact: true,
        }),
      ).toBeVisible();

      const departureLabel = page.getByText("Next departure", { exact: true });
      const departure = departureLabel.locator("xpath=ancestor::section[1]");
      const listingText = page.getByText(LISTING_TITLE, { exact: true });
      const card = page.getByRole("article").filter({ has: listingText });

      await expect(departureLabel).toBeVisible();
      await expect(
        departure.getByRole("heading", {
          level: 2,
          name: LISTING_TITLE,
          exact: true,
        }),
      ).toBeVisible();
      await expect(departure.getByText(DEPARTURE_DATE, { exact: true })).toBeVisible();
      await expect(card).toHaveCount(1);

      const cardTitle = card.getByText(LISTING_TITLE, { exact: true });
      const applicationLink = card.getByRole("link", {
        name: "View application",
        exact: true,
      });
      const cardActions = applicationLink.locator("xpath=..");

      await expect(
        cardActions.getByText("Accepted", { exact: true }),
      ).toBeVisible();
      await expect(card.getByText(LISTING_START, { exact: true })).toBeVisible();
      await expect(card.getByText("about 5 months", { exact: true })).toBeVisible();
      await expect(applicationLink).toHaveAttribute("href", APPLICATION_PATH);
      await expectTouchTarget(applicationLink, "View application");
      await expectContained(departure, page.locator("body"), "next departure");
      await expectContained(card, page.locator("body"), "accepted role card");
      await expectContained(cardTitle, card, "accepted role title");
      await expectContained(cardActions, card, "accepted role actions");
      await expectContained(
        applicationLink,
        cardActions,
        "View application action",
      );
      await expectNoDocumentOverflow(page);

      await expectClickableAboveSeekerChrome(page, applicationLink);
      await applicationLink.click();
      await expect(page).toHaveURL(`${BASE}${APPLICATION_PATH}`);
      await hideOptionalDevBench(page);

      await expect(
        page.getByRole("heading", {
          level: 1,
          name: LISTING_TITLE,
          exact: true,
        }),
      ).toBeVisible();

      const detailCard = page.getByRole("article", {
        name: LISTING_TITLE,
        exact: true,
      });
      const listingLink = detailCard.getByRole("link", {
        name: "View listing",
        exact: true,
      });
      const backToAccepted = page.getByRole("link", {
        name: "Back to accepted roles",
        exact: true,
      });

      await expect(detailCard.getByText("Accepted", { exact: true })).toBeVisible();
      await expect(listingLink).toHaveAttribute("href", `/listing/${LISTING_ID}`);
      await expect(backToAccepted).toHaveAttribute("href", ACCEPTED_PATH);
      await expectTouchTarget(listingLink, "View listing");
      await expectTouchTarget(backToAccepted, "Back to accepted roles");
      await expect(
        detailCard.getByRole("button", { name: "Message host", exact: true }),
      ).toHaveCount(0);
      await expect(
        detailCard.getByRole("button", { name: "Withdraw", exact: true }),
      ).toHaveCount(0);
      await expectContained(detailCard, page.locator("body"), "application detail");
      await expectContained(listingLink, detailCard, "View listing action");
      await expectContained(backToAccepted, page.locator("body"), "Back to accepted roles");
      await expectNoDocumentOverflow(page);

      expect(
        serverActionPosts,
        `accepted flow sent a Next server action at ${viewport.width}px`,
      ).toEqual([]);

      await backToAccepted.click();
      await expect(page).toHaveURL(`${BASE}${ACCEPTED_PATH}`);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Accepted",
          exact: true,
        }),
      ).toBeVisible();
      await expectNoDocumentOverflow(page);
      expect(serverActionPosts).toEqual([]);
    }
  });
});
