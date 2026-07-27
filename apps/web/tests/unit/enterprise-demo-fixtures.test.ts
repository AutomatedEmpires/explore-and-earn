import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ANALYTICS_ENTITLEMENT, PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

import {
  DEMO_ANALYTICS,
  DEMO_ANALYTICS_LABEL,
  DEMO_ANNOUNCEMENTS,
  DEMO_APPLICANTS,
  DEMO_BANNER_TEXT,
  DEMO_DATA_LABEL,
  DEMO_DISCOVERY_SOURCES,
  DEMO_JOB,
  DEMO_LABELS,
  DEMO_LISTING,
  DEMO_METRICS,
  DEMO_OPPORTUNITY_VIEWS,
  DEMO_ORG,
  DEMO_PERFORMANCE_LABEL,
  DEMO_PLAN_USAGE,
  DEMO_SURFACES,
  DEMO_THREADS,
  DEMO_TOTAL_APPLICATIONS,
} from "../../components/demo/enterpriseDemo";
import {
  DEMO_TOUR,
  DEMO_TOUR_STOP_COUNT,
  plansIncluding,
} from "../../components/demo/tourStops";

/**
 * THE DEMO MUST NEVER BE MISTAKEN FOR THE MARKETPLACE.
 *
 * The Enterprise demo workspace exists so a host can want the product before
 * they are billed for it, which puts a page full of invented numbers on the
 * public internet. Two failure modes make that dishonest rather than useful:
 *
 *   1. A demo surface renders a figure with no "this is sample data" label. The
 *      label lives on the FIXTURE, not in a page's JSX, precisely so a later
 *      edit cannot quietly drop it — and these tests fail if an item ever
 *      arrives without one.
 *   2. The figures contradict each other. A dashboard whose per-listing rows do
 *      not add up to its own headline is not "plausible sample data", it is
 *      evidence that nobody checked — and a host who spots it stops believing
 *      the real numbers too.
 *
 * The source scans at the bottom guard the claims the page is allowed to make:
 * no team seats (the entitlement is zero), no named competitor, no invented
 * program.
 */

const APPS_WEB = fileURLToPath(new URL("../../", import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(join(APPS_WEB, relativePath), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

// ── 1. Every demo item is labelled ─────────────────────────────────────────

describe("every demo fixture carries the label its component renders", () => {
  it("labels the organisation and the job", () => {
    expect(DEMO_LABELS).toContain(DEMO_ORG.demoLabel);
    expect(DEMO_LABELS).toContain(DEMO_JOB.demoLabel);
  });

  it.each([
    ["metrics", DEMO_METRICS],
    ["announcements", DEMO_ANNOUNCEMENTS],
    ["applicants", DEMO_APPLICANTS],
    ["threads", DEMO_THREADS],
    ["discovery sources", DEMO_DISCOVERY_SOURCES],
    ["plan usage", DEMO_PLAN_USAGE],
  ])("labels every item in %s", (_name, collection) => {
    expect(collection.length).toBeGreaterThan(0);
    for (const item of collection as readonly { demoLabel: string }[]) {
      expect(DEMO_LABELS).toContain(item.demoLabel);
    }
  });

  it("uses the performance label for performance figures and the analytics label for breakdowns", () => {
    for (const metric of DEMO_METRICS) {
      expect(metric.demoLabel).toBe(DEMO_PERFORMANCE_LABEL);
    }
    for (const source of DEMO_DISCOVERY_SOURCES) {
      expect(source.demoLabel).toBe(DEMO_ANALYTICS_LABEL);
    }
    for (const announcement of DEMO_ANNOUNCEMENTS) {
      expect(announcement.demoLabel).toBe(DEMO_DATA_LABEL);
    }
  });

  it("states in the banner that the data is sample data and the plan is Enterprise", () => {
    expect(DEMO_BANNER_TEXT.toLowerCase()).toContain("demo workspace");
    expect(DEMO_BANNER_TEXT.toLowerCase()).toContain("sample data");
    expect(DEMO_BANNER_TEXT).toContain(DEMO_ORG.planName);
  });
});

// ── 2. The numbers agree with each other ───────────────────────────────────

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

describe("the demo analytics are internally consistent", () => {
  it("account-wide stage counts add up to the headline application total", () => {
    expect(sum(Object.values(DEMO_ANALYTICS.totalApplicationsByStatus))).toBe(
      DEMO_TOTAL_APPLICATIONS,
    );
  });

  it("per-listing stage counts add up to the account-wide counts", () => {
    const rolled: Record<string, number> = {};
    for (const stat of DEMO_ANALYTICS.perListingStats) {
      for (const [stage, count] of Object.entries(stat.applicationsByStatus)) {
        rolled[stage] = (rolled[stage] ?? 0) + count;
      }
    }
    expect(rolled).toEqual(DEMO_ANALYTICS.totalApplicationsByStatus);
  });

  it("each listing's own total matches its own stage counts", () => {
    for (const stat of DEMO_ANALYTICS.perListingStats) {
      expect(sum(Object.values(stat.applicationsByStatus))).toBe(
        stat.totalApplications,
      );
    }
  });

  it("the invite acceptance rate is the per-listing invites, not a separate claim", () => {
    const sent = sum(DEMO_ANALYTICS.perListingStats.map((s) => s.invitesSent));
    const accepted = sum(
      DEMO_ANALYTICS.perListingStats.map((s) => s.invitesAccepted),
    );
    expect(accepted).toBeLessThanOrEqual(sent);
    expect(DEMO_ANALYTICS.inviteAcceptanceRate).toBeCloseTo(accepted / sent, 10);
  });

  it("never claims more live listings than listings", () => {
    expect(DEMO_ANALYTICS.activeListingCount).toBeLessThanOrEqual(
      DEMO_ANALYTICS.listingCount,
    );
    expect(DEMO_ANALYTICS.perListingStats.length).toBeLessThanOrEqual(
      DEMO_ANALYTICS.listingCount,
    );
  });

  it("shows the analytics depth the demo plan actually grants", () => {
    expect(DEMO_ANALYTICS.analyticsScope).toBe(
      ANALYTICS_ENTITLEMENT[DEMO_ORG.planTier],
    );
  });

  it("discovery-source views add up to the opportunity-view total", () => {
    expect(sum(DEMO_DISCOVERY_SOURCES.map((s) => s.views))).toBe(
      DEMO_OPPORTUNITY_VIEWS,
    );
  });

  it("discovery-source shares add up to a whole", () => {
    const shares = DEMO_DISCOVERY_SOURCES.map((s) => Number(s.share.replace("%", "")));
    expect(sum(shares)).toBe(100);
  });

  it("never uses more of an allowance than the plan includes", () => {
    const entitlement = PLAN_ENTITLEMENTS[DEMO_ORG.planTier];
    for (const row of DEMO_PLAN_USAGE) {
      expect(row.used).toBeLessThanOrEqual(entitlement[row.entitlementKey]);
    }
  });
});

// ── 3. Announcement honesty ────────────────────────────────────────────────

describe("demo announcements", () => {
  it("covers draft, scheduled and published", () => {
    const statuses = new Set(DEMO_ANNOUNCEMENTS.map((a) => a.status));
    expect(statuses).toEqual(new Set(["draft", "scheduled", "published"]));
  });

  it("carries engagement ONLY for announcements that actually ran", () => {
    for (const announcement of DEMO_ANNOUNCEMENTS) {
      if (announcement.status === "published") {
        expect(announcement.engagement).not.toBeNull();
      } else {
        // A projection for something that has not been sent is a fabricated
        // result. Absence here is the honest value, not a missing field.
        expect(announcement.engagement).toBeNull();
      }
    }
  });

  it("gives a scheduled or published announcement a date and a draft none", () => {
    for (const announcement of DEMO_ANNOUNCEMENTS) {
      if (announcement.status === "draft") {
        expect(announcement.date).toBeNull();
      } else {
        expect(announcement.date).toBeTruthy();
      }
    }
  });
});

// ── 4. The demo listing is a real listing shape with no remote assets ──────

describe("the demo listing", () => {
  it("states all three triad benefits, which is what publication requires", () => {
    for (const key of ["housing", "meals", "pay"] as const) {
      expect(DEMO_LISTING.benefits[key].provision).not.toBe("not_stated");
      expect(DEMO_LISTING.benefits[key].summary).toBeTruthy();
    }
  });

  it("carries no cover image — the card's no-cover path is the honest one", () => {
    expect(DEMO_LISTING.coverImageUrl).toBeUndefined();
    expect(DEMO_LISTING.cover).toBeUndefined();
  });

  it("belongs to the demo organisation and shows its verified, paid state", () => {
    expect(DEMO_LISTING.host.name).toBe(DEMO_ORG.name);
    expect(DEMO_LISTING.host.tier).toBe(DEMO_ORG.planTier);
    expect(DEMO_LISTING.host.verified).toBe(DEMO_ORG.verified);
  });

  it("never sets the founding flag, which would render a program that does not exist", () => {
    expect(DEMO_LISTING.founding).toBeUndefined();
  });

  it("references no remote host anywhere in the fixture module", () => {
    const source = readSource("components/demo/enterpriseDemo.ts");
    expect(source).not.toMatch(/https?:\/\//);
  });
});

// ── 5. The tour ────────────────────────────────────────────────────────────

describe("the product tour", () => {
  it("only tours surfaces the workspace actually has", () => {
    const surfaceIds = new Set(DEMO_SURFACES.map((s) => s.id));
    for (const key of Object.keys(DEMO_TOUR)) {
      expect(surfaceIds.has(key)).toBe(true);
    }
  });

  it("gives every stop a title, a reason, and a plan statement", () => {
    expect(DEMO_TOUR_STOP_COUNT).toBeGreaterThanOrEqual(12);
    for (const stops of Object.values(DEMO_TOUR)) {
      for (const stop of stops) {
        expect(stop.title.length).toBeGreaterThan(0);
        expect(stop.body.length).toBeGreaterThan(40);
        expect(stop.plans.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The team-seat class of defect, in miniature: an entitlement nothing grants
   * must render as "nobody has this", never as an unqualified feature claim.
   */
  it("says so plainly when no plan includes something", () => {
    expect(plansIncluding(() => false)).toMatch(/not included/i);
    expect(plansIncluding((e) => e.teamSeats > 0)).toMatch(/not included/i);
  });

  it("derives plan statements from the contract, so every plan is named correctly", () => {
    expect(plansIncluding(() => true)).toMatch(/every plan/i);
    expect(plansIncluding((e) => e.analytics === "full")).toContain("Professional");
    expect(plansIncluding((e) => e.analytics === "full")).toContain("Enterprise");
    expect(plansIncluding((e) => e.analytics === "full")).not.toContain("Starter");
  });

  it("points every stop at an element id, so the coachmark has something to show", () => {
    for (const stops of Object.values(DEMO_TOUR)) {
      for (const stop of stops) {
        expect(stop.targetId, `${stop.id} has no target`).toBeTruthy();
      }
    }
  });
});

// ── 6. Claim guards on the acquisition page ────────────────────────────────

const FOR_HOSTS = readSource("app/[locale]/for-hosts/page.tsx");

/**
 * Named in one place so a future edit that reintroduces one fails loudly. The
 * comparison column is deliberately generic: naming a competitor means
 * asserting facts about their current product, and nothing in this repo
 * verifies those.
 */
const COMPETITOR_NAMES = [
  "CoolWorks",
  "Cool Works",
  "Indeed",
  "ZipRecruiter",
  "LinkedIn",
  "Monster",
  "Glassdoor",
  "Craigslist",
  "Workaway",
  "WWOOF",
];

describe("the /for-hosts page", () => {
  it("sells no team seat, because accepting an invitation grants no access", () => {
    expect(PLAN_ENTITLEMENTS.enterprise.teamSeats).toBe(0);
    expect(FOR_HOSTS).not.toMatch(/team seat/i);
    expect(FOR_HOSTS).not.toMatch(/teamSeats/);
  });

  it("names no competitor in the comparison", () => {
    for (const name of COMPETITOR_NAMES) {
      expect(FOR_HOSTS).not.toContain(name);
    }
  });

  it("keeps the comparison column generic and says so", () => {
    expect(FOR_HOSTS).toContain("Traditional listing platform");
    expect(FOR_HOSTS).toMatch(/general job-board pattern/i);
  });

  it("offers both hero actions: build a profile, and see the demo", () => {
    expect(FOR_HOSTS).toContain("/sign-up?role=host");
    expect(FOR_HOSTS).toContain("/for-hosts/demo");
  });

  it("sends plan checkout to the ungated plans route", () => {
    expect(FOR_HOSTS).toContain('href="/host/plans"');
  });

  it("reads prices and entitlements from the contract, never as literals", () => {
    expect(FOR_HOSTS).toContain("FOUNDER_LOCKED_PRICING");
    expect(FOR_HOSTS).toContain("PLAN_ENTITLEMENTS");
    expect(FOR_HOSTS).toContain("ANNUAL_MONTHS_BILLED");
  });

  it("frames annual billing as months, never as a percentage discount", () => {
    expect(FOR_HOSTS).toContain("two months free");
    expect(FOR_HOSTS).not.toMatch(/\d+\s*%\s*(off|discount|saving)/i);
  });

  it("fires the landing funnel event", () => {
    expect(FOR_HOSTS).toContain("hostLandingViewed");
  });

  it("links the three real discovery routes", () => {
    for (const route of ['"/seek"', '"/swipe"', '"/map"']) {
      expect(FOR_HOSTS).toContain(route);
    }
  });
});

// ── 7. Claim guards across the demo workspace ──────────────────────────────

describe("the demo workspace", () => {
  const demoRoutes = walk(join(APPS_WEB, "app/[locale]/for-hosts/demo"));
  const demoComponents = walk(join(APPS_WEB, "components/demo"));

  it("has a page for every advertised surface", () => {
    for (const surface of DEMO_SURFACES) {
      const suffix = surface.href.replace("/for-hosts/demo", "");
      const expected = join(
        APPS_WEB,
        "app/[locale]/for-hosts/demo",
        suffix,
        "page.tsx",
      );
      expect(demoRoutes, `${surface.href} has no page`).toContain(expected);
    }
  });

  it("renders the persistent disclosure from the layout, not from each page", () => {
    const layout = readSource("app/[locale]/for-hosts/demo/layout.tsx");
    expect(layout).toContain("DemoBanner");
  });

  it("keeps sample data out of the search index", () => {
    const layout = readSource("app/[locale]/for-hosts/demo/layout.tsx");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it("sells no team seat anywhere in the workspace", () => {
    for (const file of [...demoRoutes, ...demoComponents]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/team seat/i);
    }
  });

  it("loads no remote asset anywhere in the workspace", () => {
    for (const file of [...demoRoutes, ...demoComponents]) {
      const source = readFileSync(file, "utf8");
      // The lone allowed absolute URL is the SVG namespace on the brand mark.
      const remotes = (source.match(/https?:\/\/[^"'\s)]+/g) ?? []).filter(
        (url) => url !== "http://www.w3.org/2000/svg",
      );
      expect(remotes, file).toEqual([]);
    }
  });

  it("renders the real analytics dashboard rather than a lookalike", () => {
    const dashboard = readSource(
      "app/[locale]/for-hosts/demo/dashboard/page.tsx",
    );
    expect(dashboard).toContain("HostAnalyticsDashboard");
    expect(dashboard).toContain("DEMO_ANALYTICS");
  });

  it("renders the real discovery card rather than a lookalike", () => {
    const card = readSource("components/demo/DemoJobCard.tsx");
    expect(card).toContain("ListingCardGrid");
    expect(card).toContain("DEMO_LISTING");
  });

  it("keeps a demo fixture out of every real write path", () => {
    const card = readSource("components/demo/DemoJobCard.tsx");
    // The card's default handlers open drawers that read the database for the
    // id they are given, navigate to routes that do not exist for a fixture, or
    // file a moderation report against it.
    for (const handler of [
      "onOpen",
      "onHostClick",
      "onHousingClick",
      "onMealsClick",
      "onPayClick",
      "onLocationClick",
      "onReport",
    ]) {
      expect(card, `${handler} is not overridden`).toContain(`${handler}:`);
    }
  });
});
