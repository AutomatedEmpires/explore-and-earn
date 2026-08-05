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
  seekerDemoThreads,
} from "../../components/demo/full-fidelity/seeker/model";

const HOST_ROOT = "/for-hosts/demo";
const SEEKER_ROOT = "/for-seekers/demo";

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`The full-fidelity scenario needs ${description}`);
  }
  return value;
}

const hostListing = required(hostDemoListings[0], "a host listing");
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
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      requests.push(`${request.method()} ${request.url()}`);
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
  test("host legal action, message, settings, and reset stay browser-only", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const mutations = captureMutations(page);
    const hostReply = "Session-only host reply from the walkthrough test.";

    await page.goto(`${HOST_ROOT}/applicants/${hostApplication.id}`);
    await expect(
      page.getByText("Private note editing is not simulated."),
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
});

test.describe("full-fidelity mobile decisions and accessibility", () => {
  test("the pinned mobile dock and decision row are exactly 20/60/20", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${SEEKER_ROOT}/seek`);

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

  test("benefit dialog traps focus, closes on Escape, and landmarks remain intact", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${SEEKER_ROOT}/listing/${seekerListing.id}`);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
    await expect(
      page.getByRole("note", { name: "Sample seeker account notice" }),
    ).toBeVisible();

    const housingTrigger = page
      .getByRole("button", { name: /^Housing\b/ })
      .first();
    await housingTrigger.click();
    const dialog = page.getByRole("dialog", { name: "Housing" });
    const close = dialog.getByRole("button", { name: "Close details" });
    const completeListing = dialog.getByRole("link", {
      name: /Review the complete listing/,
    });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(completeListing).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(housingTrigger).toBeFocused();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(HOST_ROOT);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Host sections" }),
    ).toBeVisible();
    await expect(
      page.getByRole("note", { name: "Sample workspace notice" }),
    ).toBeVisible();
  });
});

test("dense surfaces fit every launch viewport and attach responsive evidence", async ({
  page,
}, testInfo) => {
  test.setTimeout(900_000);
  await page.emulateMedia({ reducedMotion: "reduce" });

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
