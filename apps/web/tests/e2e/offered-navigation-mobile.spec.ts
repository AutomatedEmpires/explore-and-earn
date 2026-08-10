import { expect, test, type Locator, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";
const OFFERED_PATH = "/offered";
const APPLICATION_ID = "dev-application-orchard-offered";
const APPLICATION_PATH = `/applied/${APPLICATION_ID}`;
const LISTING_ID = "lst_orchard_wenatchee";
const LISTING_TITLE = "Orchard Harvest Hand";
const HOST_NAME = "Cascade Bloom Orchards";
const LOCATION = "Wenatchee, Washington";

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
  expect(
    geometry.left,
    `${label} starts outside its container`,
  ).toBeGreaterThanOrEqual(containerGeometry.left - 1);
  expect(
    geometry.right,
    `${label} ends outside its container`,
  ).toBeLessThanOrEqual(containerGeometry.right + 1);
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
    page
      .getByRole("button", { name: "Replay the quick tour", exact: true })
      .boundingBox(),
  ]);

  expect(target).not.toBeNull();
  expect(dock).not.toBeNull();
  expect(coachmarkLauncher).not.toBeNull();
  expect(target!.y + target!.height).toBeLessThanOrEqual(
    Math.min(dock!.y, coachmarkLauncher!.y),
  );
}

async function expectConfirmationCanBeCancelled(
  page: Page,
  opener: Locator,
  heading: "Accept this offer?" | "Decline this offer?",
  confirmLabel: "Confirm acceptance" | "Confirm decline",
  dismissWith: "cancel" | "escape",
) {
  await opener.click();

  const dialog = page.getByRole("dialog", { name: heading, exact: true });
  const confirm = dialog.getByRole("button", {
    name: confirmLabel,
    exact: true,
  });
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("This is a demo:");
  await expect(confirm).toBeFocused();
  await expectTouchTarget(confirm, confirmLabel);
  await expectTouchTarget(cancel, "Cancel");
  await expectContained(dialog, page.locator("body"), `${heading} dialog`);

  if (dismissWith === "cancel") {
    await cancel.click();
  } else {
    await page.keyboard.press("Escape");
  }

  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
}

async function confirmDemoDecision(
  page: Page,
  actions: Locator,
  opener: Locator,
  heading: "Accept this offer?" | "Decline this offer?",
  confirmLabel: "Confirm acceptance" | "Confirm decline",
  previewText: string,
  lockedLabel: "Preview accepted" | "Preview declined",
) {
  await opener.click();

  const dialog = page.getByRole("dialog", { name: heading, exact: true });
  const confirm = dialog.getByRole("button", {
    name: confirmLabel,
    exact: true,
  });

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("This is a demo:");
  await expect(confirm).toBeFocused();
  await confirm.click();

  await expect(dialog).toHaveCount(0);
  await expect(actions.getByRole("status")).toHaveText(previewText);
  await expect(
    actions.getByRole("button", { name: lockedLabel, exact: true }),
  ).toBeDisabled();
  await expect(actions.getByRole("button", { name: /Accept|Decline/ })).toBeDisabled();
}

test.describe("offered application navigation on phones", () => {
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

  test("reviews an offer without mutating and opens its exact application", async ({
    page,
  }) => {
    const serverActionPosts: string[] = [];
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
      const response = await page.goto(OFFERED_PATH);
      expect(response?.ok()).toBeTruthy();
      await expect(page).toHaveURL(`${BASE}${OFFERED_PATH}`);
      await hideOptionalDevBench(page);

      await expect(
        page.getByRole("heading", { level: 1, name: "Offered", exact: true }),
      ).toBeVisible();

      const listingTitle = page.getByText(LISTING_TITLE, { exact: true });
      const card = page.getByRole("article").filter({ has: listingTitle });
      const actions = card
        .getByRole("link", { name: "View application", exact: true })
        .locator("xpath=..");
      const applicationLink = actions.getByRole("link", {
        name: "View application",
        exact: true,
      });
      const accept = actions.getByRole("button", {
        name: "Accept",
        exact: true,
      });
      const decline = actions.getByRole("button", {
        name: "Decline",
        exact: true,
      });

      await expect(card).toHaveCount(1);
      await expect(card.getByText(HOST_NAME, { exact: true })).toBeVisible();
      await expect(card.getByText(LISTING_TITLE, { exact: true })).toBeVisible();
      await expect(card.getByText(LOCATION, { exact: true })).toBeVisible();
      await expect(card.getByText("Offered", { exact: true })).toBeVisible();
      await expect(card.getByText("Aug 12, 2026", { exact: true })).toBeVisible();
      await expect(card.getByText("Oct 28, 2026", { exact: true })).toBeVisible();
      await expect(
        card.getByRole("button", {
          name: "Match 88 percent — why this matched",
          exact: true,
        }),
      ).toBeVisible();
      await expect(card.getByText("about 3 months", { exact: true })).toHaveCount(0);
      await expect(
        card.getByRole("button", { name: "Housing: included", exact: true }),
      ).toBeVisible();
      await expect(
        card.getByRole("button", {
          name: "Meals: partially provided",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        card.getByRole("button", { name: "Pay — $17/hr", exact: true }),
      ).toBeVisible();
      await expect(card.getByText("Shared bunkhouse", { exact: true })).toHaveCount(0);
      await expect(
        card.getByText("Partial — Lunch on shift", { exact: true }),
      ).toHaveCount(0);
      await expect(applicationLink).toHaveAttribute("href", APPLICATION_PATH);

      await expectTouchTarget(applicationLink, "View application");
      await expectTouchTarget(accept, "Accept");
      await expectTouchTarget(decline, "Decline");
      await expectContained(card, page.locator("body"), "offered card");
      await expectContained(actions, card, "offered actions");
      await expectContained(applicationLink, actions, "View application");
      await expectContained(accept, actions, "Accept");
      await expectContained(decline, actions, "Decline");
      await expectNoDocumentOverflow(page);

      await expectClickableAboveSeekerChrome(page, accept);
      await expectConfirmationCanBeCancelled(
        page,
        accept,
        "Accept this offer?",
        "Confirm acceptance",
        "cancel",
      );
      await expectClickableAboveSeekerChrome(page, decline);
      await expectConfirmationCanBeCancelled(
        page,
        decline,
        "Decline this offer?",
        "Confirm decline",
        "escape",
      );
      expect(serverActionPosts).toEqual([]);

      await expectClickableAboveSeekerChrome(page, accept);
      await confirmDemoDecision(
        page,
        actions,
        accept,
        "Accept this offer?",
        "Confirm acceptance",
        "Preview only — this demo offer would now be accepted. No application or host was changed.",
        "Preview accepted",
      );
      expect(serverActionPosts).toEqual([]);
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

      const detail = page.getByRole("article", {
        name: LISTING_TITLE,
        exact: true,
      });
      const listingLink = detail.getByRole("link", {
        name: "View listing",
        exact: true,
      });
      const backToOffers = page.getByRole("link", {
        name: "Back to offers",
        exact: true,
      });
      const detailAccept = detail.getByRole("button", {
        name: "Accept",
        exact: true,
      });
      const detailDecline = detail.getByRole("button", {
        name: "Decline",
        exact: true,
      });
      const timeline = page
        .getByRole("heading", {
          level: 3,
          name: "Status timeline",
          exact: true,
        })
        .locator("xpath=..");
      const reviewedStep = timeline.getByRole("listitem").filter({
        hasText: "Reviewed by host",
      });
      const offerStep = timeline.getByRole("listitem").filter({
        hasText: "Offer received",
      });

      await expect(detail.getByText("Offer received", { exact: true })).toBeVisible();
      await expect(
        timeline.getByText("Offer received", { exact: true }),
      ).toBeVisible();
      await expect(
        timeline.getByText(
          "The host offered you this role. Review the details and respond when you’re ready.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        timeline.getByText("Decision made", { exact: true }),
      ).toHaveCount(0);
      await expect(
        reviewedStep.getByText("Pending", { exact: true }),
      ).toBeVisible();
      await expect(
        offerStep.getByText("Date not recorded", { exact: true }),
      ).toBeVisible();
      await expect(
        offerStep.getByText("Pending", { exact: true }),
      ).toHaveCount(0);
      await expect(listingLink).toHaveAttribute("href", `/listing/${LISTING_ID}`);
      await expect(backToOffers).toHaveAttribute("href", OFFERED_PATH);
      await expect(
        detail.getByRole("link", { name: "View application", exact: true }),
      ).toHaveCount(0);
      await expect(
        detail.getByRole("button", { name: "Message host", exact: true }),
      ).toHaveCount(0);
      await expect(
        detail.getByRole("button", { name: "Withdraw", exact: true }),
      ).toHaveCount(0);

      await expectTouchTarget(listingLink, "View listing");
      await expectTouchTarget(backToOffers, "Back to offers");
      await expectTouchTarget(detailAccept, "detail Accept");
      await expectTouchTarget(detailDecline, "detail Decline");
      await expectContained(detail, page.locator("body"), "application detail");
      await expectContained(listingLink, detail, "View listing");
      await expectContained(backToOffers, page.locator("body"), "Back to offers");
      await expectContained(timeline, page.locator("body"), "status timeline");
      await expectNoDocumentOverflow(page);

      await expectClickableAboveSeekerChrome(page, detailAccept);
      await expectConfirmationCanBeCancelled(
        page,
        detailAccept,
        "Accept this offer?",
        "Confirm acceptance",
        "cancel",
      );
      await expectClickableAboveSeekerChrome(page, detailDecline);
      await expectConfirmationCanBeCancelled(
        page,
        detailDecline,
        "Decline this offer?",
        "Confirm decline",
        "escape",
      );
      expect(serverActionPosts).toEqual([]);

      await expectClickableAboveSeekerChrome(page, detailDecline);
      await confirmDemoDecision(
        page,
        detail,
        detailDecline,
        "Decline this offer?",
        "Confirm decline",
        "Preview only — this demo offer would now be declined. No application or host was changed.",
        "Preview declined",
      );
      expect(serverActionPosts).toEqual([]);
      await expectNoDocumentOverflow(page);

      await expectClickableAboveSeekerChrome(page, backToOffers);
      await backToOffers.click();
      await expect(page).toHaveURL(`${BASE}${OFFERED_PATH}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Offered", exact: true }),
      ).toBeVisible();
      await expectNoDocumentOverflow(page);
      expect(
        serverActionPosts,
        `offered flow sent a Next server action at ${viewport.width}px`,
      ).toEqual([]);
    }
  });

  test("conceals the synthetic offer from the host role", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "host", url: BASE },
    ]);

    await page.goto(APPLICATION_PATH);
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
    await expect(page.getByText(HOST_NAME, { exact: true })).toHaveCount(0);
    await expect(page.getByText(LOCATION, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "View listing", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Accept", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Decline", exact: true }),
    ).toHaveCount(0);
  });
});
