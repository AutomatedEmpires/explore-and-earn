import { expect, test, type Locator, type Page } from "playwright/test";

const BASE = "http://localhost:3100";
const DEV_ROLE_COOKIE = "ee_dev_role";
const OUTREACH_PATH = "/host/outreach";
const PREVIEW_NOTICE =
  "Local preview only. Search and invite controls do not access or change data.";
const PREVIEW_STATUS = "Preview only — no invite was sent or credit used.";
const ORCHARD_LISTING_TITLE =
  "OrchardHarvestCrewWithAnExtremelyLongUnbrokenListingIdentifierForContainment";
const CONTAINMENT_SEEKER_NAME =
  "ContainmentSpecialistWithAnExtremelyLongUnbrokenDisplayNameForPhoneLayouts";
const LONG_EMPTY_QUERY = "z".repeat(100);

const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;

async function hideDevBench(page: Page) {
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
  const [box, containerBox] = await Promise.all([
    locator.boundingBox(),
    container.boundingBox(),
  ]);
  expect(box, `${label} has no box`).not.toBeNull();
  expect(containerBox, `${label} container has no box`).not.toBeNull();
  expect(box!.x, `${label} starts outside its container`).toBeGreaterThanOrEqual(
    containerBox!.x - 1,
  );
  expect(
    box!.x + box!.width,
    `${label} ends outside its container`,
  ).toBeLessThanOrEqual(containerBox!.x + containerBox!.width + 1);
}

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has no box`).not.toBeNull();
  expect(box!.width, `${label} is narrower than 44px`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} is shorter than 44px`).toBeGreaterThanOrEqual(44);
}

test.describe("host outreach truth on phones", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "host", url: BASE },
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie_consent", "essential");
      window.localStorage.setItem(
        "ee_host_coachmarks_v1",
        JSON.stringify({ index: 0, done: true }),
      );
    });
  });

  test("keeps the real route contained, actionless, and state-truthful", async ({
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
      const response = await page.goto(OUTREACH_PATH);
      expect(response?.ok()).toBeTruthy();
      await hideDevBench(page);

      const fixture = page.locator('[data-dev-fixture="host-outreach"]');
      await expect(fixture).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: "Outreach", exact: true }),
      ).toBeVisible();

      const matches = page.getByRole("region", {
        name: "Seekers who fit your listings",
        exact: true,
      });
      const averyCard = matches.getByRole("article", {
        name: "Avery Nguyen seeker profile",
      });
      const jordanCard = matches.getByRole("article", {
        name: "Jordan Lee seeker profile",
      });
      await expect(matches).toBeVisible();
      await expect(averyCard).toBeVisible();
      await expect(jordanCard).toBeVisible();
      await expectContained(matches, page.locator("body"), "matched seekers region");
      await expectContained(averyCard, matches, "Avery seeker card");
      await expectContained(jordanCard, matches, "Jordan seeker card");
      await expect(
        matches.getByText("No sourceable matches for this listing yet.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        matches.getByRole("alert").filter({
          hasText: "Matched seekers are temporarily unavailable for this listing.",
        }),
      ).toBeVisible();
      await expect(
        matches.getByRole("button", { name: "Already invited", exact: true }),
      ).toBeDisabled();
      const sentMetric = page
        .getByText("Invites sent", { exact: true })
        .locator("../..");
      const deliveredMetric = page
        .getByText("Delivered", { exact: true })
        .locator("../..");
      const appliedMetric = page
        .getByText("Turned into applications", { exact: true })
        .locator("../..");
      await expect(sentMetric.getByText("2", { exact: true })).toBeVisible();
      await expect(sentMetric.getByText("All time", { exact: true })).toBeVisible();
      await expect(deliveredMetric.getByText("100%", { exact: true })).toBeVisible();
      await expect(deliveredMetric.getByText("2 of 2", { exact: true })).toBeVisible();
      await expect(appliedMetric.getByText("50%", { exact: true })).toBeVisible();
      await expect(appliedMetric.getByText("1 of 2", { exact: true })).toBeVisible();
      await expect(page.getByText("100% delivered", { exact: true })).toHaveCount(2);
      await expect(page.getByText("Declined", { exact: true })).toBeVisible();
      await expect(page.getByText(/no response/i)).toHaveCount(0);

      const matchedPreview = averyCard.getByRole("button", {
        name: "Preview invite",
        exact: true,
      });
      await expectContained(matchedPreview, averyCard, "matched preview CTA");
      await expectTouchTarget(matchedPreview, "matched preview CTA");
      await matchedPreview.click();
      await expect(
        matches.getByText(PREVIEW_STATUS, { exact: true }),
      ).toBeVisible();

      const listing = page.getByRole("combobox", { name: "Invite for", exact: true });
      const openDrawer = page.getByRole("button", {
        name: "Invite a seeker",
        exact: true,
      });
      await expectContained(listing, fixture, "invite listing combobox");
      await expectContained(openDrawer, fixture, "invite drawer opener");
      await expectTouchTarget(listing, "invite listing combobox");
      await expectTouchTarget(openDrawer, "invite drawer opener");
      await listing.selectOption({ label: "Vineyard Tasting Host" });
      await openDrawer.click();

      let dialog = page.getByRole("dialog", { name: "Invite a seeker", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("note").filter({ hasText: PREVIEW_NOTICE })).toBeVisible();
      await expectContained(dialog, page.locator("body"), "invite drawer");
      const drawerClose = dialog.getByRole("button", {
        name: "Close invite popup",
        exact: true,
      });
      await expectContained(drawerClose, dialog, "drawer close control");
      await expectTouchTarget(drawerClose, "drawer close control");

      const search = dialog.getByRole("searchbox", {
        name: "Search seekers",
        exact: true,
      });
      await search.fill("Jordan");
      const searchButton = dialog.getByRole("button", {
        name: "Search",
        exact: true,
      });
      await expectContained(searchButton, dialog, "drawer search CTA");
      await expectTouchTarget(searchButton, "drawer search CTA");
      await searchButton.click();
      const chooseJordan = dialog.getByRole("button", {
        name: "Choose Jordan Lee",
        exact: true,
      });
      await expect(chooseJordan).toBeEnabled();
      await chooseJordan.click();
      const clear = dialog.getByRole("button", {
        name: "Choose a different seeker",
        exact: true,
      });
      await expectTouchTarget(clear, "clear selected seeker");
      const personalMessage = dialog.getByRole("textbox", {
        name: "Personal message (optional)",
        exact: true,
      });
      await expect(personalMessage).toBeFocused();
      await personalMessage.fill("A note intended only for Jordan.");
      await dialog.getByRole("button", { name: "Back", exact: true }).click();
      await expect(chooseJordan).toBeFocused();
      await search.fill("Avery");
      await searchButton.click();
      await dialog
        .getByRole("button", { name: "Choose Avery Nguyen", exact: true })
        .click();
      await expect(personalMessage).toBeFocused();
      await expect(personalMessage).toHaveValue("");
      await personalMessage.fill("Your harvest experience looks relevant.");
      const composePreview = dialog.getByRole("button", {
        name: "Preview invite",
        exact: true,
      });
      await expectContained(composePreview, dialog, "compose preview CTA");
      await expectTouchTarget(composePreview, "compose preview CTA");
      await composePreview.click();
      const previewStatus = dialog.getByText(PREVIEW_STATUS, { exact: true });
      await expect(previewStatus).toBeVisible();
      await expect(previewStatus).toBeFocused();
		await expect(
			dialog.getByRole("button", {
				name: "Previewed: Avery Nguyen",
				exact: true,
			}),
		).toBeDisabled();
		await expect(
			dialog.getByRole("button", {
				name: "Already invited: Avery Nguyen",
				exact: true,
			}),
		).toHaveCount(0);
      await page.keyboard.press("Tab");
      await expect(drawerClose).toBeFocused();

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(openDrawer).toBeFocused();

      // alreadyInvited is listing-scoped: Jordan is disabled for Orchard only.
      await listing.selectOption({ label: ORCHARD_LISTING_TITLE });
      await openDrawer.click();
      dialog = page.getByRole("dialog", { name: "Invite a seeker", exact: true });
      await dialog
        .getByRole("searchbox", { name: "Search seekers", exact: true })
        .fill("Jordan");
      await dialog.getByRole("button", { name: "Search", exact: true }).click();
      await expect(
        dialog.getByRole("button", {
          name: "Already invited: Jordan Lee",
          exact: true,
        }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      await openDrawer.click();
      dialog = page.getByRole("dialog", { name: "Invite a seeker", exact: true });
      const drawerSearch = dialog.getByRole("searchbox", {
        name: "Search seekers",
        exact: true,
      });
      await drawerSearch.fill(LONG_EMPTY_QUERY);
      await dialog.getByRole("button", { name: "Search", exact: true }).click();
      const longEmptyResult = dialog.getByText(
        `No seekers matched “${LONG_EMPTY_QUERY}”. Try another name or profile keyword.`,
        { exact: true },
      );
      await expect(longEmptyResult).toBeVisible();
      await expectContained(longEmptyResult, dialog, "long-token empty result");
      await expectNoDocumentOverflow(page);
      await drawerSearch.fill("offline");
      await dialog.getByRole("button", { name: "Search", exact: true }).click();
      await expect(
        dialog.getByRole("alert").filter({
          hasText: "Seeker search is temporarily unavailable. Try again.",
        }),
      ).toBeVisible();

      await drawerSearch.fill("Containment");
      await dialog.getByRole("button", { name: "Search", exact: true }).click();
      const longResult = dialog.getByRole("button", {
        name: `Choose ${CONTAINMENT_SEEKER_NAME}`,
        exact: true,
      });
      await expectContained(longResult, dialog, "long-token search result");
      await longResult.click();
      await expect(
        dialog.getByText(CONTAINMENT_SEEKER_NAME, { exact: true }),
      ).toBeVisible();
      await expectContained(
        dialog.getByText(CONTAINMENT_SEEKER_NAME, { exact: true }),
        dialog,
        "long-token selected seeker",
      );
      await dialog.getByRole("button", { name: "Back", exact: true }).click();
      await expect(longResult).toBeFocused();

      await expectContained(drawerSearch, dialog, "search input");
      await expectTouchTarget(drawerSearch, "search input");
      await expectNoDocumentOverflow(page);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expectNoDocumentOverflow(page);
      expect(
        serverActionPosts,
        `outreach preview sent a Next server action at ${viewport.width}px`,
      ).toEqual([]);
    }
  });

  test("conceals host fixture data from a seeker dev role", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      { name: DEV_ROLE_COOKIE, value: "seeker", url: BASE },
    ]);
    const response = await page.goto(OUTREACH_PATH);
    expect(response?.ok()).toBeTruthy();
    await expect(
      page.getByRole("heading", { level: 1, name: "Outreach", exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-dev-fixture="host-outreach"]')).toHaveCount(0);
    await expect(page.getByText("Avery Nguyen", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Jordan Lee", { exact: true })).toHaveCount(0);
    await expect(page.getByText(PREVIEW_NOTICE, { exact: true })).toHaveCount(0);
  });

  test("keeps the component-catalog invite specimen actionless", async ({ page }) => {
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
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto("/dev/catalog");
    expect(response?.ok()).toBeTruthy();
    await hideDevBench(page);

    await page
      .getByRole("button", { name: "Invite seeker (search)", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Invite a seeker",
      exact: true,
    });
    await expect(dialog.getByRole("note")).toContainText(PREVIEW_NOTICE);
    await dialog
      .getByRole("searchbox", { name: "Search seekers", exact: true })
      .fill("Avery");
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Choose Avery Nguyen", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Preview invite", exact: true })
      .click();
    await expect(dialog.getByText(PREVIEW_STATUS, { exact: true })).toBeVisible();
    expect(serverActionPosts).toEqual([]);
  });
});
