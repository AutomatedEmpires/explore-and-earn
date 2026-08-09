import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "playwright/test";

import { DEMO_ORGANIZATION } from "../../components/demo/full-fidelity/scenario";
import {
  hostDemoApplicationActions,
  hostDemoApplications,
  hostDemoListings,
  hostDemoThreads,
} from "../../components/demo/full-fidelity/host/adapter";
import {
  seekerDemoApplications,
  seekerDemoInitialSavedIds,
  seekerDemoListings,
  seekerDemoNotifications,
  seekerDemoThreads,
} from "../../components/demo/full-fidelity/seeker/model";

const HOST_ROOT = "/for-hosts/demo";
const SEEKER_ROOT = "/for-seekers/demo";
const APP_ORIGIN = "http://localhost:3100";

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`The full-fidelity scenario needs ${description}`);
  }
  return value;
}

const hostListing = required(hostDemoListings[0], "a host listing");
const publicHostListing = required(
  hostDemoListings.find((listing) => listing.status === "published"),
  "a published host listing",
);
const hostApplication = required(
  hostDemoApplications.find(
    (application) => hostDemoApplicationActions(application.status).length > 0,
  ),
  "an application with a legal host transition",
);
const hostAction = required(
  hostDemoApplicationActions(hostApplication.status)[0],
  "one legal host application action",
);
const hostThread = required(hostDemoThreads[0], "a host conversation");

const seededSeekerListingIds = new Set(
  seekerDemoApplications.map((application) => application.listingId),
);
const initiallySavedIds = new Set(seekerDemoInitialSavedIds);
const seekerListing = required(
  seekerDemoListings.find(
    (listing) =>
      !seededSeekerListingIds.has(listing.id) && !initiallySavedIds.has(listing.id),
  ) ?? seekerDemoListings.find((listing) => !seededSeekerListingIds.has(listing.id)),
  "an unapplied seeker listing",
);
const seekerApplication = required(
  seekerDemoApplications[0],
  "a seeker application",
);
const seekerThread = required(seekerDemoThreads[0], "a seeker conversation");
const unreadSeekerThread = required(
  seekerDemoThreads.find((thread) => thread.unread),
  "an unread seeker conversation",
);
const initialUnreadSeekerThreadCount = seekerDemoThreads.filter((thread) => thread.unread).length;
const initialUnreadSeekerNotificationCount = seekerDemoNotifications.filter(
  (notification) => !notification.read,
).length;

/** Every physical page under app/[locale]/for-hosts/demo. */
const HOST_ROUTES = [
  HOST_ROOT,
  `${HOST_ROOT}/analytics`,
  `${HOST_ROOT}/announcements`,
  `${HOST_ROOT}/applicants`,
  `${HOST_ROOT}/applicants/${hostApplication.id}`,
  `${HOST_ROOT}/billing`,
  `${HOST_ROOT}/coach`,
  `${HOST_ROOT}/dashboard`,
  `${HOST_ROOT}/help`,
  `${HOST_ROOT}/job`,
  `${HOST_ROOT}/listings`,
  `${HOST_ROOT}/listings/new`,
  `${HOST_ROOT}/listings/${hostListing.id}`,
  `${HOST_ROOT}/listings/${hostListing.id}/edit`,
  `${HOST_ROOT}/location`,
  `${HOST_ROOT}/messages`,
  `${HOST_ROOT}/messages/${hostThread.id}`,
  `${HOST_ROOT}/notifications`,
  `${HOST_ROOT}/outreach`,
  `${HOST_ROOT}/plan`,
  `${HOST_ROOT}/profile`,
  `${HOST_ROOT}/profile/edit`,
  `${HOST_ROOT}/profile/location`,
  `${HOST_ROOT}/profile/team`,
  `${HOST_ROOT}/seeker-view`,
  `${HOST_ROOT}/settings`,
  `${HOST_ROOT}/team`,
] as const;

/** Every unique physical page under app/[locale]/for-seekers/demo. */
const SEEKER_ROUTES = [
  SEEKER_ROOT,
  `${SEEKER_ROOT}/accepted`,
  `${SEEKER_ROOT}/applications`,
  `${SEEKER_ROOT}/applications/${seekerApplication.id}`,
  `${SEEKER_ROOT}/applied`,
  `${SEEKER_ROOT}/applied/${seekerApplication.id}`,
  `${SEEKER_ROOT}/assistant`,
  `${SEEKER_ROOT}/badges`,
  `${SEEKER_ROOT}/community`,
  `${SEEKER_ROOT}/help`,
  `${SEEKER_ROOT}/home`,
  `${SEEKER_ROOT}/host/${DEMO_ORGANIZATION.id}`,
  `${SEEKER_ROOT}/invites`,
  `${SEEKER_ROOT}/journey`,
  `${SEEKER_ROOT}/listing/${seekerListing.id}`,
  `${SEEKER_ROOT}/listing/${seekerListing.id}/apply`,
  `${SEEKER_ROOT}/map`,
  `${SEEKER_ROOT}/messages`,
  `${SEEKER_ROOT}/messages/${seekerThread.id}`,
  `${SEEKER_ROOT}/not-selected`,
  `${SEEKER_ROOT}/notifications`,
  `${SEEKER_ROOT}/offers`,
  `${SEEKER_ROOT}/profile`,
  `${SEEKER_ROOT}/profile/edit`,
  `${SEEKER_ROOT}/resume`,
  `${SEEKER_ROOT}/saved`,
  `${SEEKER_ROOT}/schedule`,
  `${SEEKER_ROOT}/seek`,
  `${SEEKER_ROOT}/settings`,
  `${SEEKER_ROOT}/swipe`,
  `${SEEKER_ROOT}/withdrawn`,
] as const;

async function expectPublicRoutes(
  routes: readonly string[],
  namespace: string,
  request: APIRequestContext,
) {
  expect(new Set(routes).size, `${namespace} contains duplicate route checks`).toBe(
    routes.length,
  );

  for (const path of routes) {
    const response = await request.get(path);
    const finalPath = new URL(response.url()).pathname;
    const stayedInDemo =
      finalPath === namespace || finalPath.startsWith(`${namespace}/`);

    expect(response.status(), path).toBeGreaterThanOrEqual(200);
    expect(response.status(), path).toBeLessThan(400);
    expect(
      stayedInDemo,
      `${path} redirected outside the public demo to ${finalPath}`,
    ).toBe(true);
    expect((await response.text()).toLowerCase(), path).not.toContain(
      "something went sideways",
    );
  }
}

function captureMutations(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === APP_ORIGIN &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())
    ) {
      requests.push(`${request.method()} ${url.pathname}`);
    }
  });
  return requests;
}

async function expectNoHorizontalOverflow(page: Page, path: string) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const overflow = root.scrollWidth - viewportWidth;
    const offenders =
      overflow > 1
        ? [...document.querySelectorAll<HTMLElement>("body *")]
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                className:
                  typeof element.className === "string" ? element.className : "",
                left: Math.round(rect.left),
                right: Math.round(rect.right),
              };
            })
            .filter(
              (entry) => entry.right > viewportWidth + 1 || entry.left < -1,
            )
            .slice(0, 8)
        : [];
    return { overflow, viewportWidth, offenders };
  });

  expect(
    result.overflow,
    `${path} is ${result.overflow}px wider than ${result.viewportWidth}px: ${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(1);
}

async function useEssentialOnlyConsent(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cookie_consent", "essential");
    } catch {
      // The walkthrough remains usable when storage is unavailable; the
      // screenshot assertions below still catch any consent overlay.
    }
  });
}

test.describe("full-fidelity public walkthrough route inventory", () => {
  test("every host route is public, healthy, and stays in the demo", async ({
    request,
  }) => {
    test.setTimeout(720_000);
    await expectPublicRoutes(HOST_ROUTES, HOST_ROOT, request);
  });

  test("every unique seeker route is public, healthy, and stays in the demo", async ({
    request,
  }) => {
    test.setTimeout(720_000);
    await expectPublicRoutes(SEEKER_ROUTES, SEEKER_ROOT, request);
  });
});

test.describe("full-fidelity session-local behavior", () => {
  test("host edits validate dates and the seeker preview never links mismatched details", async ({
    page,
  }) => {
    const mutations = captureMutations(page);
    const editedTitle = `${publicHostListing.title} · session edit`;

    await page.goto(`${HOST_ROOT}/listings/${publicHostListing.id}/edit`);
    await page.getByLabel("Begins").fill("Oct 4, 2026");
    await page.getByLabel("Ends", { exact: true }).fill("May 18, 2026");
    await page.getByRole("button", { name: "Save demo listing" }).click();
    await expect(
      page.getByRole("alert").filter({
        hasText: "The ending date must be on or after the beginning date.",
      }),
    ).toBeVisible();

    await page.getByLabel("Begins").fill(publicHostListing.startDate);
    await page.getByLabel("Ends", { exact: true }).fill(publicHostListing.endDate);
    await page.getByLabel("Position title").fill(editedTitle);
    await page.getByRole("button", { name: "Save demo listing" }).click();
    await expect(
      page.getByText("Listing updated in this tab.", { exact: true }),
    ).toBeVisible();

    await page.goto(`${HOST_ROOT}/seeker-view`);
    await expect(page.getByText("Public preview boundary")).toBeVisible();
    await expect(page.getByText(editedTitle, { exact: true })).toHaveCount(0);
    const canonicalListingLink = page
      .locator(`a[href="${SEEKER_ROOT}/listing/${publicHostListing.id}"]`)
      .first();
    await expect(
      page.getByText(publicHostListing.title, { exact: true }),
    ).toBeVisible();
    await expect(canonicalListingLink).toBeVisible();
    await canonicalListingLink.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      publicHostListing.title,
    );

    expect(mutations, "the host preview flow issued a server mutation").toEqual([]);
  });

  test("host legal action, message, settings, and reset stay browser-only", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const mutations = captureMutations(page);
    const hostReply = "Session-only host reply from the walkthrough test.";

    await page.goto(`${HOST_ROOT}/applicants/${hostApplication.id}`);
    await expect(
      page.getByRole("heading", { name: "Candidate planning workspace" }),
    ).toBeVisible();
    await expect(
      page.getByText(/production applicant detail does not persist these collaboration fields/i),
    ).toBeVisible();
    const legalActions = page.getByLabel("Legal application actions");
    await expect(legalActions).toBeVisible();
    await legalActions
      .getByRole("button", { name: hostAction.label, exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      `${hostAction.label} completed in this demo.`,
    );

    await page.goto(`${HOST_ROOT}/messages/${hostThread.id}`);
    await page.getByLabel("Reply", { exact: true }).fill(hostReply);
    await page.getByRole("button", { name: "Send in demo" }).click();
    await expect(page.getByText(hostReply, { exact: true })).toBeVisible();

    await page.goto(`${HOST_ROOT}/settings`);
    const emailMaster = page.getByRole("checkbox", { name: /^Email\b/ });
    const emailStartedChecked = await emailMaster.isChecked();
    await emailMaster.click();
    await expect(emailMaster).toBeChecked({ checked: !emailStartedChecked });
    await page
      .getByRole("button", { name: "Save demo preferences" })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Demo preferences saved.",
    );

    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(
      page.getByRole("button", { name: "Reset complete" }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^Email\b/ })).toBeChecked({
      checked: emailStartedChecked,
    });

    await page.goto(`${HOST_ROOT}/applicants/${hostApplication.id}`);
    await expect(
      page
        .getByLabel("Legal application actions")
        .getByRole("button", { name: hostAction.label, exact: true }),
    ).toBeVisible();
    await page.goto(`${HOST_ROOT}/messages/${hostThread.id}`);
    await expect(page.getByText(hostReply, { exact: true })).toHaveCount(0);

    expect(mutations, "the host walkthrough issued a server mutation").toEqual(
      [],
    );
  });

  test("seeker save, two-step apply, message, and reset stay browser-only", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const mutations = captureMutations(page);
    const seekerReply = "Session-only seeker reply from the walkthrough test.";

    await page.goto(`${SEEKER_ROOT}/seek`);
    const actionBar = page.getByLabel(`Actions for ${seekerListing.title}`);
    await expect(actionBar).toBeVisible();
    await actionBar.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      actionBar.getByRole("button", { name: "Saved", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await actionBar.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page).toHaveURL(
      `${SEEKER_ROOT}/listing/${seekerListing.id}/apply`,
    );

    await page
      .getByRole("button", { name: "Continue to confirmation" })
      .click();
    const submit = page.getByRole("button", {
      name: "Submit sample application",
    });
    await expect(submit).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: /I understand this submission stays inside the fictional walkthrough/,
      })
      .check();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(
      page.getByRole("heading", {
        name: "Application added to your sample lifecycle.",
      }),
    ).toBeVisible();

    await page.goto(`${SEEKER_ROOT}/messages/${seekerThread.id}`);
    await page.getByLabel("Reply in this walkthrough").fill(seekerReply);
    await page.getByRole("button", { name: "Add sample reply" }).click();
    await expect(page.getByText(seekerReply, { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Added to this sample conversation only. Nothing was sent.",
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(page).toHaveURL(SEEKER_ROOT);
    await page.goto(`${SEEKER_ROOT}/seek`);
    const resetActionBar = page.getByLabel(`Actions for ${seekerListing.title}`);
    await expect(
      resetActionBar.getByRole("button", { name: "Save", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      resetActionBar.getByRole("button", { name: "Apply", exact: true }),
    ).toBeEnabled();
    await page.goto(`${SEEKER_ROOT}/messages/${seekerThread.id}`);
    await expect(page.getByText(seekerReply, { exact: true })).toHaveCount(0);

    expect(
      mutations,
      "the seeker walkthrough issued a server mutation",
    ).toEqual([]);
  });

  test("seeker home skip advances to the next eligible role", async ({ page }) => {
    const mutations = captureMutations(page);
    await page.goto(`${SEEKER_ROOT}/home`);

    const currentActions = page.getByRole("main").locator('[aria-label^="Actions for "]').first();
    await expect(currentActions).toBeVisible();
    const currentLabel = required(
      await currentActions.getAttribute("aria-label"),
      "a labeled home recommendation",
    );

    await currentActions.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(page.getByRole("main").getByLabel(currentLabel, { exact: true })).toHaveCount(0);

    const nextActions = page.getByRole("main").locator('[aria-label^="Actions for "]').first();
    await expect(nextActions).toBeVisible();
    expect(await nextActions.getAttribute("aria-label")).not.toBe(currentLabel);

    await page.reload();
    await expect(page.getByRole("main").getByLabel(currentLabel, { exact: true })).toHaveCount(0);
    expect(mutations, "skipping a home recommendation issued a server mutation").toEqual([]);
  });

  test("seeker message reads update only the message unread state", async ({ page }) => {
    const mutations = captureMutations(page);
    const remainingUnread = initialUnreadSeekerThreadCount - 1;
    const messageNav = () => page.locator(`a[href="${SEEKER_ROOT}/messages"]:visible`).first();
    const notificationNav = () => page.locator(`a[href="${SEEKER_ROOT}/notifications"]:visible`).first();

    await page.goto(`${SEEKER_ROOT}/messages`);
    await expect(page.getByText(`Messages · ${initialUnreadSeekerThreadCount} unread`, { exact: true })).toBeVisible();
    await expect(messageNav().locator(`[aria-label="${initialUnreadSeekerThreadCount} new"]`)).toBeVisible();
    if (initialUnreadSeekerNotificationCount > 0) {
      await expect(notificationNav().locator(`[aria-label="${initialUnreadSeekerNotificationCount} new"]`)).toBeVisible();
    }

    const unreadRow = page.getByRole("main").locator(`a[href="${SEEKER_ROOT}/messages/${unreadSeekerThread.id}"]`);
    await expect(unreadRow.getByText("New", { exact: true })).toBeVisible();
    await unreadRow.click();
    await expect(page).toHaveURL(`${SEEKER_ROOT}/messages/${unreadSeekerThread.id}`);

    const messageBadge = messageNav().locator('[aria-label$=" new"]');
    if (remainingUnread > 0) {
      await expect(messageBadge).toHaveAttribute("aria-label", `${remainingUnread} new`);
    } else {
      await expect(messageBadge).toHaveCount(0);
    }
    if (initialUnreadSeekerNotificationCount > 0) {
      await expect(notificationNav().locator(`[aria-label="${initialUnreadSeekerNotificationCount} new"]`)).toBeVisible();
    }

    await page.getByLabel("Reply in this walkthrough").fill("Read-state regression reply.");
    await page.getByRole("button", { name: "Add sample reply" }).click();
    await page.goto(`${SEEKER_ROOT}/messages`);
    await expect(page.getByText(`Messages · ${remainingUnread} unread`, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("main").locator(`a[href="${SEEKER_ROOT}/messages/${unreadSeekerThread.id}"]`).getByText("New", { exact: true }),
    ).toHaveCount(0);

    await page.reload();
    await expect(page.getByText(`Messages · ${remainingUnread} unread`, { exact: true })).toBeVisible();
    if (initialUnreadSeekerNotificationCount > 0) {
      await expect(notificationNav().locator(`[aria-label="${initialUnreadSeekerNotificationCount} new"]`)).toBeVisible();
    }
    expect(mutations, "reading or replying to a seeker thread issued a server mutation").toEqual([]);
  });

  test("seeker profile edits return to the exact pending application", async ({
    page,
  }) => {
    const mutations = captureMutations(page);
    const editedIntroduction =
      "I guide guests calmly, communicate clearly, and am ready for this sample season.";

    await page.goto(`${SEEKER_ROOT}/listing/${seekerListing.id}/apply`);
    await page.getByRole("link", { name: "Edit sample profile" }).click();
    await expect(page).toHaveURL(
      `${SEEKER_ROOT}/profile/edit?apply=${seekerListing.id}`,
    );
    await page.getByLabel("Introduction").fill(editedIntroduction);
    await page
      .getByRole("button", { name: "Save and return to application" })
      .click();
    await expect(page).toHaveURL(
      `${SEEKER_ROOT}/listing/${seekerListing.id}/apply`,
    );
    await expect(page.getByText(editedIntroduction, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "This is the profile attached to the application.",
      }),
    ).toBeVisible();

    expect(mutations, "the seeker profile flow issued a server mutation").toEqual([]);
  });
});

test.describe("full-fidelity mobile decisions and accessibility", () => {
  test("the pinned mobile dock and decision row are exactly 20/60/20", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await useEssentialOnlyConsent(page);
    await page.goto(`${SEEKER_ROOT}/seek`);

    await expect(
      page.getByRole("dialog", { name: "Cookie consent" }),
    ).toHaveCount(0);
    const menuButton = page.getByRole("button", {
      name: "Open Seeker menu",
    });
    const search = page.getByRole("banner").getByRole("search");
    const searchInput = search.getByRole("searchbox", {
      name: "Search opportunities, places, hosts…",
    });
    const notifications = page.getByRole("link", {
      name: "Notifications",
      exact: true,
    });
    const profile = page.getByRole("link", {
      name: "Your profile",
      exact: true,
    });
    await expect(menuButton).toBeVisible();
    await expect(search).toBeVisible();
    await expect(searchInput).toHaveAttribute("placeholder", "Search");
    await expect(searchInput).toHaveAccessibleName(
      "Search opportunities, places, hosts…",
    );
    await expect(notifications).toBeVisible();
    await expect(profile).toBeHidden();

    const headerControls = [
      { name: "menu", locator: menuButton },
      { name: "search", locator: search },
      { name: "notifications", locator: notifications },
    ];
    for (const control of headerControls) {
      const box = await control.locator.boundingBox();
      expect(box, `${control.name} control has no rendered box`).not.toBeNull();
      if (!box) continue;
      expect(
        box.height,
        `${control.name} control is shorter than 44px`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        box.x,
        `${control.name} control begins outside the viewport`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        box.x + box.width,
        `${control.name} control ends outside the viewport`,
      ).toBeLessThanOrEqual(320);
    }
    const searchBox = await search.boundingBox();
    expect(
      searchBox?.width ?? 0,
      "search pill is too narrow at 320px",
    ).toBeGreaterThanOrEqual(120);
    expect(
      (await searchInput.boundingBox())?.width ?? 0,
      "search input is too narrow to use at 320px",
    ).toBeGreaterThanOrEqual(80);

    const dock = page.getByRole("navigation", { name: "Seeker" });
    await expect(dock).toBeVisible();
    await expect(dock.getByRole("link")).toHaveText([
      "Seek",
      "Swipe",
      "Map",
      "Profile",
    ]);
    expect(
      await dock.getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      ),
    ).toEqual([
      `${SEEKER_ROOT}/seek`,
      `${SEEKER_ROOT}/swipe`,
      `${SEEKER_ROOT}/map`,
      `${SEEKER_ROOT}/profile`,
    ]);
    expect(
      await dock.evaluate((element) => {
        const style = getComputedStyle(element);
        return { position: style.position, bottom: style.bottom };
      }),
    ).toEqual({ position: "fixed", bottom: "0px" });

    const actionBar = page.getByLabel(`Actions for ${seekerListing.title}`);
    const buttons = actionBar.getByRole("button");
    await expect(buttons).toHaveText(["Skip", "Apply", "Save"]);
    const dimensions = await buttons.evaluateAll((elements) =>
      elements.map((element) => ({
        flexBasis: getComputedStyle(element).flexBasis,
        width: element.getBoundingClientRect().width,
      })),
    );
    expect(dimensions.map(({ flexBasis }) => flexBasis)).toEqual([
      "20%",
      "60%",
      "20%",
    ]);
    const total = dimensions.reduce((sum, { width }) => sum + width, 0);
    expect(dimensions[0]!.width / total).toBeCloseTo(0.2, 2);
    expect(dimensions[1]!.width / total).toBeCloseTo(0.6, 2);
    expect(dimensions[2]!.width / total).toBeCloseTo(0.2, 2);
  });

  test("listing detail navigation clears the sticky mobile chrome", async ({
    page,
  }) => {
    await useEssentialOnlyConsent(page);
    await page.emulateMedia({ reducedMotion: "reduce" });

    const detailPath = `${SEEKER_ROOT}/listing/${seekerListing.id}`;
    const destinations = [
      {
        label: "Photos",
        href: "#demo-listing-photos",
        id: "demo-listing-photos",
      },
      {
        label: "Host",
        href: "#demo-listing-host",
        id: "demo-listing-host",
      },
      {
        label: "Weather",
        href: "#demo-listing-weather",
        id: "demo-listing-weather",
      },
      {
        label: "Position",
        href: "#demo-listing-position",
        id: "demo-listing-position",
      },
      {
        label: "Location",
        href: "#demo-listing-location",
        id: "demo-listing-location",
      },
      {
        label: "Company & team",
        href: "#demo-listing-company-team",
        id: "demo-listing-company-team",
      },
    ] as const;

    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(detailPath);

      const sectionNav = page.getByRole("navigation", {
        name: "On this page",
        exact: true,
      });
      const links = sectionNav.getByRole("link");
      const header = page.getByRole("banner").first();
      const dock = page.getByRole("navigation", {
        name: "Seeker",
        exact: true,
      });

      await expect(sectionNav).toBeVisible();
      await expect(links).toHaveText(
        destinations.map(({ label }) => label),
      );
      const hrefs = await links.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("href")),
      );
      expect(hrefs).toEqual(destinations.map(({ href }) => href));
      expect(
        new Set(hrefs).size,
        `listing section navigation repeats a destination at ${width}px`,
      ).toBe(destinations.length);

      const selector = destinations.map(({ id }) => `#${id}`).join(",");
      const renderedOrder = await page.locator(selector).evaluateAll((elements) =>
        elements.map((element) => element.id),
      );
      expect(
        renderedOrder,
        `listing sections render out of navigation order at ${width}px`,
      ).toEqual(destinations.map(({ id }) => id));

      for (const { id } of destinations) {
        await expect(page.locator(`#${id}`)).toHaveCount(1);
      }

      const fullHostProfile = page
        .locator("#demo-listing-host")
        .getByRole("link", {
          name: "View full host profile",
          exact: true,
        });
      await expect(fullHostProfile).toHaveCount(1);
      await expect(fullHostProfile).toHaveAttribute(
        "href",
        "/for-seekers/demo/host/demo_org_juniper_wake",
      );

      const chrome = await Promise.all([
        header.evaluate((element) => ({
          position: getComputedStyle(element).position,
          height: element.getBoundingClientRect().height,
        })),
        dock.evaluate((element) => ({
          position: getComputedStyle(element).position,
          bottom: getComputedStyle(element).bottom,
        })),
      ]);
      expect(chrome[0].position).toBe("sticky");
      expect(chrome[0].height).toBeGreaterThanOrEqual(44);
      expect(chrome[1]).toEqual({ position: "fixed", bottom: "0px" });

      for (const destination of destinations) {
        await sectionNav.locator(`a[href="${destination.href}"]`).click();
        await expect
          .poll(() => page.evaluate(() => window.location.hash))
          .toBe(destination.href);

        const target = page.locator(`#${destination.id}`);
        await expect(target).toBeVisible();
        await expect
          .poll(
            () =>
              target.evaluate((element) => {
                const topbar = document.querySelector<HTMLElement>(
                  ".seekeros-top",
                );
                const bottomDock = document.querySelector<HTMLElement>(
                  ".seekeros-mnav",
                );
                if (!topbar || !bottomDock) return false;
                const targetBox = element.getBoundingClientRect();
                const topbarBox = topbar.getBoundingClientRect();
                const dockBox = bottomDock.getBoundingClientRect();
                const visibleHeight =
                  Math.min(targetBox.bottom, dockBox.top) -
                  Math.max(targetBox.top, topbarBox.bottom);
                return (
                  targetBox.top >= topbarBox.bottom - 1 &&
                  targetBox.top < dockBox.top &&
                  visibleHeight >= 44
                );
              }),
            {
              message: `${destination.label} anchor is obscured by mobile chrome at ${width}px`,
            },
          )
          .toBe(true);

        await expectNoHorizontalOverflow(
          page,
          `${detailPath}${destination.href} at ${width}px`,
        );
      }
    }
  });

  test("benefit dialog traps focus, closes on Escape, and landmarks remain intact", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await useEssentialOnlyConsent(page);

    for (const benefit of [
      {
        title: "Housing",
        labels: ["Sleeping area", "Bathroom", "Kitchen", "Dining/common area"],
      },
      {
        title: "Meals",
        labels: ["Kitchen", "Prepared Meal", "Dining Area", "Misc"],
      },
    ] as const) {
      await page.goto(`${SEEKER_ROOT}/listing/${seekerListing.id}`);

      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Breadcrumb" }),
      ).toBeVisible();
      await expect(
        page.getByRole("note", { name: "Sample seeker account notice" }),
      ).toBeVisible();

      const trigger = page
        .getByRole("button", { name: new RegExp(`^${benefit.title}\\b`) })
        .first();
      await trigger.click();
      const dialog = page.getByRole("dialog", {
        name: benefit.title,
        exact: true,
      });
      const close = dialog.getByRole("button", { name: "Close details" });
      const completeListing = dialog.getByRole("link", {
        name: /Review the complete listing/,
      });
      const gallery = dialog.getByRole("list", {
        name: `${benefit.title} illustrative photo categories`,
        exact: true,
      });
      const galleryItems = gallery.getByRole("listitem");
      const galleryImages = gallery.getByRole("img");
      const description = dialog.locator("#benefit-dialog-description");

      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(dialog).toHaveAttribute(
        "aria-labelledby",
        "benefit-dialog-title",
      );
      await expect(dialog).toHaveAttribute(
        "aria-describedby",
        "benefit-dialog-description",
      );
      await expect(close).toBeFocused();
      await expect(description).toContainText(/illustrative/i);
      await expect(description).toContainText(/not host-supplied evidence/i);
      await expect(gallery).toBeVisible();
      await expect(galleryItems).toHaveCount(4);
      await expect(galleryImages).toHaveCount(4);
      await expect(galleryItems).toHaveText([...benefit.labels]);

      const imageAlts = await galleryImages.evaluateAll((images) =>
        images.map((image) => image.getAttribute("alt") ?? ""),
      );
      expect(imageAlts).toHaveLength(4);
      for (const alt of imageAlts) {
        expect(alt).toMatch(/illustrative demo example/i);
        expect(alt).toMatch(/not host-supplied evidence/i);
      }

      const lastCategory = galleryItems.last();
      await lastCategory.scrollIntoViewIfNeeded();
      await expect(lastCategory).toBeInViewport();
      const [dialogBox, lastCategoryBox] = await Promise.all([
        dialog.boundingBox(),
        lastCategory.boundingBox(),
      ]);
      expect(dialogBox, `${benefit.title} dialog is missing`).not.toBeNull();
      expect(
        lastCategoryBox,
        `${benefit.title} last category is missing`,
      ).not.toBeNull();
      expect(
        lastCategoryBox?.y ?? -2,
        `${benefit.title} last category scrolls above the dialog`,
      ).toBeGreaterThanOrEqual((dialogBox?.y ?? 0) - 1);
      expect(
        (lastCategoryBox?.y ?? 0) + (lastCategoryBox?.height ?? 0),
        `${benefit.title} last category stays below the dialog viewport`,
      ).toBeLessThanOrEqual(
        (dialogBox?.y ?? 0) + (dialogBox?.height ?? 0) + 1,
      );

      const dialogWidth = await dialog.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(
        dialogWidth.scrollWidth,
        `${benefit.title} dialog overflows horizontally at 320px`,
      ).toBeLessThanOrEqual(dialogWidth.clientWidth + 1);
      await expectNoHorizontalOverflow(page, `${benefit.title} benefit dialog at 320px`);

      await expect(close).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(completeListing).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${SEEKER_ROOT}/seek`);
    await expect(
      page.getByRole("button", { name: "Open Seeker menu" }),
    ).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "Seeker sections" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(HOST_ROOT);
    await expect(
      page.getByRole("button", { name: "Open host menu" }),
    ).toBeHidden();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Host sections" }),
    ).toBeVisible();
    await expect(
      page.getByRole("note", { name: "Sample workspace notice" }),
    ).toBeVisible();
  });

  test("mobile demo chrome and profile/location surfaces stay contained", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await useEssentialOnlyConsent(page);

    for (const path of [
      `${HOST_ROOT}/profile/location`,
      `${HOST_ROOT}/profile`,
    ]) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page, path);
      await page.evaluate(() => window.scrollTo(0, 650));
      const topbar = page.getByRole("banner");
      const notice = page.getByRole("note", { name: "Sample workspace notice" });
      await expect(notice).toBeVisible();
      const [topbarBox, noticeBox] = await Promise.all([
        topbar.boundingBox(),
        notice.boundingBox(),
      ]);
      expect(topbarBox, `${path} topbar is missing`).not.toBeNull();
      expect(noticeBox, `${path} notice is missing`).not.toBeNull();
      expect(noticeBox?.y ?? 0, `${path} notice overlaps the topbar`).toBeGreaterThanOrEqual(
        (topbarBox?.y ?? 0) + (topbarBox?.height ?? 0),
      );
      expect(noticeBox?.height ?? 999, `${path} notice is too tall`).toBeLessThanOrEqual(72);
    }

    await page.goto(`${SEEKER_ROOT}/map`);
    await expectNoHorizontalOverflow(page, `${SEEKER_ROOT}/map`);
    const seekerNotice = await page
      .getByRole("note", { name: "Sample seeker account notice" })
      .boundingBox();
    expect(seekerNotice?.height ?? 999, "sample seeker notice is too tall").toBeLessThanOrEqual(72);
  });

  test("host weather and profile controls stay usable across phone widths", async ({
    page,
  }) => {
    await useEssentialOnlyConsent(page);

    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${HOST_ROOT}/profile/location`);

      const topbar = page.getByRole("banner");
      const notice = page.getByRole("note", { name: "Sample workspace notice" });
      const forecast = page.getByRole("list", {
        name: /Illustrative 10-day forecast for/,
      });
      const forecastPanel = forecast.locator("xpath=ancestor::section[1]");
      const forecastHeading = forecastPanel.getByRole("heading", {
        level: 2,
        name: "10-day location outlook",
        exact: true,
      });
      const forecastBadge = forecastPanel.getByText(
        "Illustrative demo forecast",
        { exact: true },
      );
      const days = forecast.getByRole("listitem");
      await expect(forecast).toBeVisible();
      await expect(notice).toBeVisible();
      await expectNoHorizontalOverflow(page, `host location at ${width}px`);
      const [topbarBox, noticeBox] = await Promise.all([
        topbar.boundingBox(),
        notice.boundingBox(),
      ]);
      expect(topbarBox, `host topbar is missing at ${width}px`).not.toBeNull();
      expect(noticeBox, `sample notice is missing at ${width}px`).not.toBeNull();
      expect(
        noticeBox?.y ?? 0,
        `sample notice overlaps the topbar at ${width}px`,
      ).toBeGreaterThanOrEqual(
        (topbarBox?.y ?? 0) + (topbarBox?.height ?? 0),
      );

      await expect(forecastHeading).toBeVisible();
      await expect(forecastBadge).toBeVisible();
      await expect(forecast).toHaveAttribute("tabindex", "0");
      await expect(days).toHaveCount(10);

      const [viewportWidth, panelBox, headingBox, badgeBox] = await Promise.all([
        page.evaluate(() => document.documentElement.clientWidth),
        forecastPanel.boundingBox(),
        forecastHeading.boundingBox(),
        forecastBadge.boundingBox(),
      ]);
      expect(panelBox, `forecast panel is missing at ${width}px`).not.toBeNull();
      expect(headingBox, `forecast heading is missing at ${width}px`).not.toBeNull();
      expect(badgeBox, `forecast badge is missing at ${width}px`).not.toBeNull();

      const panelLeft = panelBox?.x ?? 0;
      const panelRight = panelLeft + (panelBox?.width ?? viewportWidth);
      for (const [label, box] of [
        ["heading", headingBox],
        ["badge", badgeBox],
      ] as const) {
        expect(box?.x ?? -2, `forecast ${label} escapes left at ${width}px`).toBeGreaterThanOrEqual(
          Math.max(0, panelLeft) - 1,
        );
        expect(
          (box?.x ?? viewportWidth + 2) + (box?.width ?? 0),
          `forecast ${label} is clipped on the right at ${width}px`,
        ).toBeLessThanOrEqual(Math.min(viewportWidth, panelRight) + 1);
      }
      expect(
        headingBox?.width ?? 0,
        `forecast heading is compressed past readability at ${width}px`,
      ).toBeGreaterThanOrEqual(120);

      const [headingTextFit, badgeTextFit] = await Promise.all([
        forecastHeading.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        })),
        forecastBadge.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        })),
      ]);
      for (const [label, metrics] of [
        ["heading", headingTextFit],
        ["badge", badgeTextFit],
      ] as const) {
        expect(
          metrics.scrollWidth,
          `forecast ${label} text clips horizontally at ${width}px`,
        ).toBeLessThanOrEqual(metrics.clientWidth + 1);
        expect(
          metrics.scrollHeight,
          `forecast ${label} text clips vertically at ${width}px`,
        ).toBeLessThanOrEqual(metrics.clientHeight + 1);
      }

      const geometry = await forecast.evaluate((track) => ({
        clientWidth: track.clientWidth,
        scrollWidth: track.scrollWidth,
        dayTops: Array.from(track.children).map((day) =>
          Math.round(day.getBoundingClientRect().top),
        ),
      }));
      expect(new Set(geometry.dayTops).size, `forecast wraps at ${width}px`).toBe(1);
      expect(
        geometry.scrollWidth,
        `forecast has no internal scroll range at ${width}px`,
      ).toBeGreaterThan(geometry.clientWidth);

      await forecast.focus();
      await expect(forecast).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => forecast.evaluate((track) => track.scrollLeft))
        .toBeGreaterThan(0);
      await forecast.evaluate((track) => {
        track.scrollLeft = track.scrollWidth;
      });
      const lastDayVisible = await forecast.evaluate((track) => {
        const last = track.lastElementChild;
        if (!last) return false;
        const trackBox = track.getBoundingClientRect();
        const lastBox = last.getBoundingClientRect();
        return lastBox.left >= trackBox.left - 1 && lastBox.right <= trackBox.right + 1;
      });
      expect(lastDayVisible, `last forecast day stays hidden at ${width}px`).toBe(true);

      await page.goto(`${HOST_ROOT}/profile`);
      const editProfile = page.getByRole("link", { name: "Edit sample profile" });
      await expect(editProfile).toBeVisible();
      await expectNoHorizontalOverflow(page, `host profile at ${width}px`);
      const editBox = await editProfile.boundingBox();
      expect(editBox, `profile edit action is missing at ${width}px`).not.toBeNull();
      expect(editBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(editBox?.height ?? 999).toBeLessThanOrEqual(48);
      expect(editBox?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((editBox?.x ?? 0) + (editBox?.width ?? width + 1)).toBeLessThanOrEqual(width);
    }
  });
});

test("public mobile header and dock do not collide or exceed the viewport", async ({
  page,
}) => {
  await useEssentialOnlyConsent(page);

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/for-hosts");
    const header = page.getByRole("banner");
    const home = header.locator('a[href="/"]').first();
    const signIn = header.getByRole("button", { name: "Sign in", exact: true });
    const getStarted = header.getByRole("link", { name: "Get started", exact: true });
    const boxes = await Promise.all([
      home.boundingBox(),
      signIn.boundingBox(),
      getStarted.boundingBox(),
    ]);

    for (const [index, box] of boxes.entries()) {
      expect(box, `header control ${index} is missing at ${width}px`).not.toBeNull();
      expect(box?.height ?? 0, `header control ${index} is too short at ${width}px`).toBeGreaterThanOrEqual(44);
      expect(box?.x ?? -1, `header control ${index} begins outside ${width}px`).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? width + 1), `header control ${index} ends outside ${width}px`).toBeLessThanOrEqual(width);
    }

    const overlaps = (left: typeof boxes[number], right: typeof boxes[number]) =>
      Boolean(
        left &&
          right &&
          left.x < right.x + right.width &&
          left.x + left.width > right.x &&
          left.y < right.y + right.height &&
          left.y + left.height > right.y,
      );
    expect(overlaps(boxes[0], boxes[1]), `home overlaps sign in at ${width}px`).toBe(false);
    expect(overlaps(boxes[1], boxes[2]), `sign in overlaps get started at ${width}px`).toBe(false);

    const dock = page.getByRole("navigation", { name: "Primary", exact: true });
    const dockBox = await dock.boundingBox();
    expect(dockBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((dockBox?.x ?? 0) + (dockBox?.width ?? width + 1)).toBeLessThanOrEqual(width);
    await expectNoHorizontalOverflow(page, `/for-hosts at ${width}px`);
  }
});

test("public host profile navigation clears mobile chrome and anchor targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useEssentialOnlyConsent(page);
  await page.goto("/host/fixture_host_cascade_bloom_orchards");

  const header = page.getByRole("banner").first();
  const profileNav = page.getByRole("navigation", { name: "Host profile sections" });

  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.scrollBy(0, -96));
  await page.waitForTimeout(200);

  const [headerBox, profileNavBox] = await Promise.all([
    header.boundingBox(),
    profileNav.boundingBox(),
  ]);
  expect(headerBox, "public header is missing").not.toBeNull();
  expect(profileNavBox, "profile navigation is missing").not.toBeNull();
  expect(
    profileNavBox?.y ?? 0,
    "profile navigation overlaps the responsive public header",
  ).toBeGreaterThanOrEqual(
    (headerBox?.y ?? 0) + (headerBox?.height ?? 0) - 1,
  );

  await profileNav.getByRole("link", { name: "Story" }).click();
  const [storyBox, anchoredNavBox] = await Promise.all([
    page.getByRole("heading", { name: "About us" }).boundingBox(),
    profileNav.boundingBox(),
  ]);
  expect(storyBox, "Story anchor target is missing").not.toBeNull();
  expect(
    storyBox?.y ?? 0,
    "Story anchor is hidden beneath sticky profile navigation",
  ).toBeGreaterThanOrEqual(
    (anchoredNavBox?.y ?? 0) + (anchoredNavBox?.height ?? 0),
  );
});

test("dense surfaces fit every launch viewport and attach responsive evidence", async ({
  page,
}, testInfo) => {
  test.setTimeout(900_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useEssentialOnlyConsent(page);

  const viewports = [
    { width: 320, height: 800 },
    { width: 360, height: 800 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 900 },
    { width: 1440, height: 900 },
    { width: 1728, height: 1117 },
  ] as const;
  const hostScreenshotRoute = `${HOST_ROOT}/settings`;
  const seekerScreenshotRoute = `${SEEKER_ROOT}/listing/${seekerListing.id}`;
  const denseRoutes = [
    `${HOST_ROOT}/messages/${hostThread.id}`,
    hostScreenshotRoute,
    `${SEEKER_ROOT}/seek`,
    seekerScreenshotRoute,
  ] as const;
  const screenshotWidths = new Set([320, 768, 1440]);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of denseRoutes) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByRole("main")).toBeVisible();
      await expectNoHorizontalOverflow(page, `${path} at ${viewport.width}px`);
      if (path.startsWith(SEEKER_ROOT)) {
        await expect(
          page.getByRole("dialog", { name: "Cookie consent" }),
        ).toHaveCount(0);
      }

      if (
        screenshotWidths.has(viewport.width) &&
        (path === hostScreenshotRoute || path === seekerScreenshotRoute)
      ) {
        await testInfo.attach(
          `${path.startsWith(HOST_ROOT) ? "host" : "seeker"}-${viewport.width}.png`,
          {
            body: await page.screenshot({
              animations: "disabled",
              caret: "hide",
            }),
            contentType: "image/png",
          },
        );
      }
    }
  }
});
