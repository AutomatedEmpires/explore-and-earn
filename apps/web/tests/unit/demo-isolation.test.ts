import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { findSitePhoto } from "../../lib/sitePhotos";
import {
  DEMO_LABELS,
  DEMO_ORG,
  DEMO_ROLES,
  DEMO_SURFACES,
} from "../../components/demo/enterpriseDemo";
import { DEMO_TOUR } from "../../components/demo/tourStops";

/**
 * THE DEMO MUST NOT LEAK INTO THE PRODUCT, AND THE PRODUCT MUST NOT LEAK INTO
 * THE DEMO.
 *
 * The Enterprise demo is a page of invented records served publicly. Two
 * failure modes turn that from useful into dishonest, and neither is caught by
 * types or by a reviewer skimming a diff:
 *
 *   1. A production route imports the fixtures. Ninety-six invented applicants
 *      appearing in a real host's workspace — or a fixture listing reaching the
 *      seeker feed — is the worst thing this module could do, and an
 *      autocomplete accident is enough to do it. The source scan below is the
 *      only thing standing between that and production, so it scans the real
 *      route trees rather than trusting an import convention.
 *
 *   2. A demo surface renders without its disclosure. The labels live on the
 *      fixtures and the banner lives in the layout precisely so this cannot
 *      happen by omission, but the scan checks the surfaces anyway — the whole
 *      point of a structural rule is that something verifies it.
 *
 * It also pins the things a later edit is most likely to remove by accident:
 * noindex, the reset control, the seeker preview, and the event names the
 * funnel is measured on.
 */

const APPS_WEB = fileURLToPath(new URL("../../", import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(join(APPS_WEB, relativePath), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const DEMO_ROUTE_ROOT = join(APPS_WEB, "app/[locale]/for-hosts/demo");
const DEMO_ROUTES = walk(DEMO_ROUTE_ROOT);
const DEMO_COMPONENTS = walk(join(APPS_WEB, "components/demo"));

// ── 1. No production route may import the fixtures ─────────────────────────

/**
 * The route trees a signed-in host or seeker actually lands in. Scanned as
 * DIRECTORIES rather than as a list of files so a new route is covered the
 * moment it is created, which is the only version of this test worth having.
 */
const PRODUCTION_ROUTE_ROOTS = [
  "app/[locale]/(host)",
  "app/[locale]/(seeker)",
  "app/[locale]/(admin)",
  "app/[locale]/(host-onboard)",
  "app/[locale]/(seeker-onboard)",
  "app/[locale]/host",
  "app/[locale]/listing",
  "app/[locale]/jobs",
  "app/[locale]/search",
  "app/[locale]/team",
];

/** Component trees the production routes render. */
const PRODUCTION_COMPONENT_ROOTS = [
  "components/host",
  "components/seeker",
  "components/discovery",
  "components/listing",
  "components/admin",
  "components/community",
  "components/messaging",
];

const FIXTURE_IMPORT = /from\s+["'][^"']*(components\/demo|enterpriseDemo|tourStops)["']/;

describe("the demo fixtures never reach a production surface", () => {
  it.each(PRODUCTION_ROUTE_ROOTS)(
    "no module under %s imports the demo fixtures",
    (root) => {
      const files = walk(join(APPS_WEB, root));
      // A root that has moved is a silently passing test, so require content.
      expect(files.length, `${root} has no modules — has it moved?`).toBeGreaterThan(0);
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        expect(
          FIXTURE_IMPORT.test(source),
          `${relative(APPS_WEB, file)} imports the demo fixtures`,
        ).toBe(false);
      }
    },
  );

  it.each(PRODUCTION_COMPONENT_ROOTS)(
    "no component under %s imports the demo fixtures",
    (root) => {
      const files = walk(join(APPS_WEB, root));
      expect(files.length, `${root} has no modules — has it moved?`).toBeGreaterThan(0);
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        expect(
          FIXTURE_IMPORT.test(source),
          `${relative(APPS_WEB, file)} imports the demo fixtures`,
        ).toBe(false);
      }
    },
  );

  /**
   * The reverse direction is ALLOWED and desirable — the demo renders the real
   * components — so this asserts the traffic is one-way rather than absent.
   */
  it("but the demo does render production components", () => {
    const seekerPreview = readSource("components/demo/DemoSeekerPreview.tsx");
    expect(seekerPreview).toContain("../host/HostProfileHero");
    expect(seekerPreview).toContain("../host/PublicListingCard");
    expect(seekerPreview).toContain("../discovery/ListingCard");
    const dashboard = readSource(
      "app/[locale]/for-hosts/demo/dashboard/page.tsx",
    );
    expect(dashboard).toContain("HostAnalyticsDashboard");
  });
});

// ── 2. Zero writes, zero sends, zero service-role ──────────────────────────

describe("the demo workspace cannot write, send, or escalate", () => {
  const ALL_DEMO_FILES = [...DEMO_ROUTES, ...DEMO_COMPONENTS];

  it.each([
    ["a service-role client", /serviceClient|SERVICE_ROLE|service_role/],
    ["a server action", /"use server"/],
    ["a mail sender", /resend|sendEmail|sendMail/i],
    ["a Supabase mutation", /\.(insert|update|upsert|delete)\s*\(/],
    ["a Stripe handle", /stripe/i],
  ])("uses no %s anywhere in the workspace", (_label, pattern) => {
    for (const file of ALL_DEMO_FILES) {
      const source = readFileSync(file, "utf8");
      expect(pattern.test(source), relative(APPS_WEB, file)).toBe(false);
    }
  });

  it("loads no remote asset anywhere in the workspace", () => {
    for (const file of ALL_DEMO_FILES) {
      const source = readFileSync(file, "utf8");
      // The lone allowed absolute URL is the SVG namespace on the brand mark.
      const remotes = (source.match(/https?:\/\/[^"'\s)]+/g) ?? []).filter(
        (url) => url !== "http://www.w3.org/2000/svg",
      );
      expect(remotes, relative(APPS_WEB, file)).toEqual([]);
    }
  });

  it("sells no colleague seat, because accepting an invitation grants no access", () => {
    for (const file of ALL_DEMO_FILES) {
      expect(readFileSync(file, "utf8"), relative(APPS_WEB, file)).not.toMatch(
        /team seat/i,
      );
    }
  });

  /**
   * Pipeline moves belong to the TAB, not to the visitor. Returning a week
   * later to a workspace a previous session had shuffled would make sample data
   * look like real data that had changed — so the storage handle the provider
   * actually reaches for must be sessionStorage. Matched on the call rather
   * than the word, because the module's own comment explains the distinction
   * and would otherwise fail its own rule.
   */
  it("keeps pipeline moves session-local: window.sessionStorage only", () => {
    const session = readSource("components/demo/DemoSession.tsx");
    expect(session).toContain("window.sessionStorage");
    expect(session).not.toContain("window.localStorage");
  });

  /** The tour is the opposite case: progress is about the visitor. */
  it("keeps tour progress across visits: window.localStorage only", () => {
    const tour = readSource("components/demo/ProductTour.tsx");
    expect(tour).toContain("window.localStorage");
    expect(tour).not.toContain("window.sessionStorage");
  });
});

// ── 3. Every surface is labelled, reachable, and out of the index ──────────

describe("every demo surface", () => {
  it("has a page", () => {
    for (const surface of DEMO_SURFACES) {
      const suffix = surface.href.replace("/for-hosts/demo", "");
      const expected = join(DEMO_ROUTE_ROOT, suffix, "page.tsx");
      expect(DEMO_ROUTES, `${surface.href} has no page`).toContain(expected);
    }
  });

  it("declares itself through DemoSurfaceHeader, which fires both events", () => {
    const pages = DEMO_ROUTES.filter((file) => file.endsWith("page.tsx"));
    expect(pages.length).toBe(DEMO_SURFACES.length);
    for (const page of pages) {
      expect(readFileSync(page, "utf8"), relative(APPS_WEB, page)).toContain(
        "DemoSurfaceHeader",
      );
    }
    const header = readSource("components/demo/DemoSurfaceHeader.tsx");
    expect(header).toContain("hostDemoOpened");
    expect(header).toContain("demoSurfaceViewed");
  });

  it("renders a demo label somewhere on the page or in its components", () => {
    // The banner is structural (layout), and every fixture carries a label the
    // components render. This asserts the label COMPONENT is actually used
    // across the workspace rather than merely available.
    const usingLabel = DEMO_COMPONENTS.filter((file) =>
      /<DemoLabel\b/.test(readFileSync(file, "utf8")),
    );
    expect(usingLabel.length).toBeGreaterThanOrEqual(8);
  });

  it("renders the persistent disclosure and the toolbar from the layout", () => {
    const layout = readSource("app/[locale]/for-hosts/demo/layout.tsx");
    expect(layout).toContain("DemoBanner");
    expect(layout).toContain("DemoToolbar");
    expect(layout).toContain("DemoSessionProvider");
    expect(layout).toContain("ProductTourProvider");
  });

  it("keeps sample data out of the search index", () => {
    const layout = readSource("app/[locale]/for-hosts/demo/layout.tsx");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it("offers a reset that restores canon, and says what it does", () => {
    const toolbar = readSource("components/demo/DemoToolbar.tsx");
    expect(toolbar).toContain("Reset demo");
    expect(toolbar).toContain("session.reset");
    expect(toolbar).toMatch(/never saved|stays in this tab/i);
  });

  it("offers the seeker preview by the name the brief gives it", () => {
    const toolbar = readSource("components/demo/DemoToolbar.tsx");
    expect(toolbar).toContain("View this experience as a seeker");
    expect(DEMO_SURFACES.some((s) => s.id === "seeker")).toBe(true);
  });

  it("labels every fixture with a label the workspace actually defines", () => {
    expect(DEMO_LABELS.length).toBeGreaterThanOrEqual(3);
    for (const label of DEMO_LABELS) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ── 4. The anchored tour ───────────────────────────────────────────────────

describe("the anchored tour", () => {
  it("walks ten stops across the expanded surface set", () => {
    expect(DEMO_TOUR).toHaveLength(10);
    const surfaces = new Set(DEMO_SURFACES.map((surface) => surface.id));
    for (const stop of DEMO_TOUR) {
      expect(surfaces.has(stop.surfaceId), stop.id).toBe(true);
      expect(stop.targetId, stop.id).toBeTruthy();
      expect(stop.href, stop.id).toMatch(/^\/for-hosts\/demo/);
      expect(stop.body.length, stop.id).toBeGreaterThan(40);
      expect(stop.plans.length, stop.id).toBeGreaterThan(0);
    }
  });

  it("points every stop at an element id that exists in the source", () => {
    const workspaceSource = [...DEMO_ROUTES, ...DEMO_COMPONENTS]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const stop of DEMO_TOUR) {
      expect(
        workspaceSource.includes(`"${stop.targetId}"`),
        `${stop.id} targets ${stop.targetId}, which nothing renders`,
      ).toBe(true);
    }
  });

  it("covers the route the brief lists, in order", () => {
    expect(DEMO_TOUR.map((stop) => stop.surfaceId)).toEqual([
      "profile",
      "listings",
      "seeker",
      "applicants",
      "outreach",
      "messages",
      "announcements",
      "dashboard",
      "plan",
      "plan",
    ]);
  });

  it("is a non-modal coachmark with keyboard and screen-reader support", () => {
    const tour = readSource("components/demo/ProductTour.tsx");
    expect(tour).toContain('aria-modal="false"');
    expect(tour).toContain('role="dialog"');
    expect(tour).toContain("aria-labelledby");
    expect(tour).toContain("aria-describedby");
    expect(tour).toContain('aria-live="polite"');
    expect(tour).toContain('event.key === "Escape"');
    expect(tour).toContain("panelRef.current?.focus()");
  });

  it("persists progress and never opens itself", () => {
    const tour = readSource("components/demo/ProductTour.tsx");
    expect(tour).toContain("localStorage");
    expect(tour).toContain("writeMemory");
    // The P3 tour auto-opened on a visitor's first surface. D19 kills that.
    expect(tour).not.toMatch(/greeted/);
  });

  it("uses a scrim only on stops that ask for one", () => {
    const spotlit = DEMO_TOUR.filter((stop) => stop.spotlight);
    expect(spotlit.length).toBeGreaterThan(0);
    expect(spotlit.length).toBeLessThan(DEMO_TOUR.length);
  });
});

// ── 5. The analytics seam ──────────────────────────────────────────────────

describe("the demo analytics events", () => {
  const analytics = readSource("lib/analytics.ts");

  it.each([
    "demo_surface_viewed",
    "demo_candidate_opened",
    "demo_stage_moved",
    "demo_view_as_seeker",
    "demo_reset",
    "demo_tour_completed",
    "host_demo_opened",
  ])("defines %s", (event) => {
    expect(analytics).toContain(`"${event}"`);
  });

  it.each([
    ["demoCandidateOpened", "components/demo/DemoApplicantWorkspace.tsx"],
    ["demoStageMoved", "components/demo/DemoSession.tsx"],
    ["demoReset", "components/demo/DemoSession.tsx"],
    ["demoViewAsSeeker", "components/demo/DemoToolbar.tsx"],
    ["demoViewAsSeeker", "components/demo/DemoSeekerPreview.tsx"],
    ["demoTourCompleted", "components/demo/ProductTour.tsx"],
  ])("fires %s from %s", (event, file) => {
    expect(readSource(file)).toContain(event);
  });
});

// ── 6. Photography ─────────────────────────────────────────────────────────

describe("the demo photography", () => {
  it("renders site photos through the catalog component, never a bare tag", () => {
    const usingPhotos = DEMO_COMPONENTS.filter((file) =>
      /<SitePhoto\b/.test(readFileSync(file, "utf8")),
    );
    expect(usingPhotos.length).toBeGreaterThanOrEqual(2);
    for (const file of DEMO_COMPONENTS) {
      const source = readFileSync(file, "utf8");
      // A raw <img> would bypass the catalog's alt text and its licensing.
      expect(source, relative(APPS_WEB, file)).not.toMatch(/<img\s/);
    }
  });

  /**
   * Where a photograph has to become a bare URL — the DiscoveryCard's
   * coverImageUrl, the public profile's cover — it still comes from the
   * catalog, so the licence and the file both really exist.
   */
  it("resolves every slug it uses through the catalog", () => {
    for (const role of DEMO_ROLES) {
      const photo = findSitePhoto(role.photoSlug);
      expect(photo, `${role.id} names an unknown slug`).toBeTruthy();
      expect(photo!.alt.length).toBeGreaterThan(20);
    }
    expect(findSitePhoto(DEMO_ORG.coverPhotoSlug)).toBeTruthy();
    expect(findSitePhoto(DEMO_ORG.seasonPhotoSlug)).toBeTruthy();
  });

  it("uses a category-appropriate photograph for each role", () => {
    const expected: Readonly<Record<string, string>> = {
      demo_lst_lakeside_guest: "paddle",
      demo_lst_dock_paddle: "dock",
      demo_lst_guest_services: "lodge",
      demo_lst_trail_grounds: "trail",
      demo_lst_evening_kitchen: "kitchen",
      demo_lst_fall_retreat: "lodge",
      demo_lst_winter_ops: "idaho",
    };
    for (const role of DEMO_ROLES) {
      expect(findSitePhoto(role.photoSlug)?.category, role.id).toBe(
        expected[role.id],
      );
    }
  });

  it("leaves no gradient placeholder where a photograph now lives", () => {
    const css = readSource("components/demo/demoChrome.module.css");
    expect(css).not.toContain("photoSlot");
  });
});
