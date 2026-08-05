import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

import {
  DEMO_ACCOUNT_PEOPLE,
  DEMO_ANALYTICS_LABEL,
  DEMO_ANNOUNCEMENTS,
  DEMO_APPLICANTS,
  DEMO_BANNER_TEXT,
  DEMO_CAMPAIGNS,
  DEMO_DATA_LABEL,
  DEMO_DISCOVERY_SOURCES,
  DEMO_LABELS,
  DEMO_LISTING,
  DEMO_METRICS,
  DEMO_ORG,
  DEMO_PERFORMANCE_LABEL,
  DEMO_PLAN_USAGE,
  DEMO_ROLES,
  DEMO_THREADS,
  demoApplicant,
  initialsOf,
} from "../../components/demo/enterpriseDemo";
import { plansIncluding } from "../../components/demo/tourStops";

/**
 * THE DEMO MUST NEVER BE MISTAKEN FOR THE MARKETPLACE.
 *
 * The Enterprise demo workspace exists so a host can want the product before
 * they are billed for it, which puts a page full of invented records on the
 * public internet. Two failure modes make that dishonest rather than useful:
 *
 *   1. A demo surface renders a figure with no "this is sample data" label. The
 *      label lives on the FIXTURE, not in a page's JSX, precisely so a later
 *      edit cannot quietly drop it — and these tests fail if an item ever
 *      arrives without one.
 *   2. The demo asserts something the product cannot do, or something a plan
 *      does not grant.
 *
 * Reconciliation of the numbers has its own file (demo-derivations.test.ts) and
 * the isolation guards have theirs (demo-isolation.test.ts). This file is the
 * labelling and claim contract.
 */

const APPS_WEB = fileURLToPath(new URL("../../", import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(join(APPS_WEB, relativePath), "utf8");
}

// ── 1. Every demo item is labelled ─────────────────────────────────────────

describe("every demo fixture carries the label its component renders", () => {
  it("labels the organisation", () => {
    expect(DEMO_LABELS).toContain(DEMO_ORG.demoLabel);
  });

  it.each([
    ["roles", DEMO_ROLES],
    ["metrics", DEMO_METRICS],
    ["announcements", DEMO_ANNOUNCEMENTS],
    ["applicants", DEMO_APPLICANTS],
    ["threads", DEMO_THREADS],
    ["campaigns", DEMO_CAMPAIGNS],
    ["account people", DEMO_ACCOUNT_PEOPLE],
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

  it("references no remote host anywhere in the fixture module", () => {
    const source = readSource("components/demo/enterpriseDemo.ts");
    expect(source).not.toMatch(/https?:\/\//);
  });
});

// ── 2. Fictional people get initials, never a photograph ───────────────────

describe("invented people", () => {
  it("derives an initials avatar for every applicant", () => {
    for (const applicant of DEMO_APPLICANTS) {
      expect(applicant.initials, applicant.id).toBe(initialsOf(applicant.name));
      expect(applicant.initials.length, applicant.id).toBeGreaterThan(0);
      expect(applicant.initials.length, applicant.id).toBeLessThanOrEqual(2);
    }
  });

  it("derives an initials avatar for every person on the account", () => {
    for (const person of DEMO_ACCOUNT_PEOPLE) {
      expect(person.initials, person.id).toBe(initialsOf(person.name));
    }
  });

  /**
   * The rule that matters: a person record must have no photograph field at
   * all, so there is nothing for a future component to reach for. Scene
   * photography belongs to ROLES and to the organisation, never to a name.
   */
  it("gives no invented person a photo field of any kind", () => {
    const people = [...DEMO_APPLICANTS, ...DEMO_ACCOUNT_PEOPLE];
    for (const person of people) {
      for (const key of Object.keys(person)) {
        expect(key.toLowerCase(), `${person.id}.${key}`).not.toMatch(
          /photo|avatarurl|image|headshot/,
        );
      }
    }
  });

  it("gives every role a photo slug, because roles are scenes", () => {
    for (const role of DEMO_ROLES) {
      expect(role.photoSlug, role.id).toMatch(/^[a-z0-9-]+$/);
    }
    expect(DEMO_ORG.coverPhotoSlug).toBeTruthy();
    expect(DEMO_ORG.seasonPhotoSlug).toBeTruthy();
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

  it("never claims more applications than opens for a run", () => {
    for (const announcement of DEMO_ANNOUNCEMENTS) {
      if (!announcement.engagement) continue;
      const { views, opens, applications } = announcement.engagement;
      expect(opens).toBeLessThanOrEqual(views);
      expect(applications).toBeLessThanOrEqual(opens);
    }
  });
});

// ── 4. The demo listing is a real listing shape ────────────────────────────

describe("the demo listing", () => {
  it("states all three triad benefits, which is what publication requires", () => {
    for (const key of ["housing", "meals", "pay"] as const) {
      expect(DEMO_LISTING.benefits[key].provision).not.toBe("not_stated");
      expect(DEMO_LISTING.benefits[key].summary).toBeTruthy();
    }
  });

  it("carries a LOCAL cover from the site-photo catalog, never a remote", () => {
    expect(DEMO_LISTING.coverImageUrl).toMatch(/^\/photos\//);
  });

  it("belongs to the demo organisation and shows its verified, paid state", () => {
    expect(DEMO_LISTING.host.name).toBe(DEMO_ORG.name);
    expect(DEMO_LISTING.host.tier).toBe(DEMO_ORG.planTier);
    expect(DEMO_LISTING.host.verified).toBe(DEMO_ORG.verified);
  });

  it("never sets the founding flag, which would render a program that does not exist", () => {
    expect(DEMO_LISTING.founding).toBeUndefined();
  });
});

// ── 5. Threads join to real application records ────────────────────────────

describe("demo message threads", () => {
  it("attaches every thread to an applicant that exists", () => {
    for (const thread of DEMO_THREADS) {
      expect(demoApplicant(thread.applicantId), thread.id).toBeTruthy();
    }
  });

  it("gives every thread at least one message, and a mix of read state", () => {
    for (const thread of DEMO_THREADS) {
      expect(thread.messages.length, thread.id).toBeGreaterThan(0);
    }
    const unread = DEMO_THREADS.filter((t) => t.unread).length;
    expect(unread).toBeGreaterThan(0);
    expect(unread).toBeLessThan(DEMO_THREADS.length);
  });

  it("never names a candidate the thread is not about", () => {
    for (const thread of DEMO_THREADS) {
      const applicant = demoApplicant(thread.applicantId);
      expect(applicant, thread.id).toBeTruthy();
      // The thread stores an id, not a name — the name is looked up. This
      // asserts the record shape rather than the copy, which is what stops the
      // two drifting apart.
      expect(Object.keys(thread)).not.toContain("name");
    }
  });
});

// ── 6. The colleague-seat claim ────────────────────────────────────────────

describe("the account-people surface", () => {
  it("says plainly that no plan includes colleague access yet", () => {
    expect(PLAN_ENTITLEMENTS.enterprise.teamSeats).toBe(0);
    expect(plansIncluding((e) => e.teamSeats > 0)).toMatch(/not included/i);
  });

  it("records invitations without claiming they grant access", () => {
    for (const person of DEMO_ACCOUNT_PEOPLE) {
      if (person.kind === "owner") continue;
      expect(person.accessNote.toLowerCase(), person.id).toMatch(
        /not granted|does not open/,
      );
    }
  });

  it("derives plan statements from the contract, so every plan is named correctly", () => {
    expect(plansIncluding(() => true)).toMatch(/every plan/i);
    expect(plansIncluding((e) => e.analytics === "full")).toContain("Professional");
    expect(plansIncluding((e) => e.analytics === "full")).toContain("Enterprise");
    expect(plansIncluding((e) => e.analytics === "full")).not.toContain("Starter");
  });
});

// ── 7. Claim guards on the acquisition page ────────────────────────────────

const FOR_HOSTS = readSource("app/[locale]/for-hosts/HostMarketingPage.tsx");

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
  it("sells no colleague seat, because accepting an invitation grants no access", () => {
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

  it("links the three isolated full-fidelity discovery routes", () => {
    for (const route of [
      '"/for-seekers/demo/seek"',
      '"/for-seekers/demo/swipe"',
      '"/for-seekers/demo/map"',
    ]) {
      expect(FOR_HOSTS).toContain(route);
    }
  });
});

// ── 8. The card cannot reach a real write path ─────────────────────────────

describe("the demo job card", () => {
  it("renders the real discovery card rather than a lookalike", () => {
    const card = readSource("components/demo/DemoJobCard.tsx");
    expect(card).toContain("DiscoveryCard");
    expect(card).toContain("DEMO_ROLES");
  });

  it("overrides every handler that would touch a real row or route", () => {
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

  it("does the same for the seeker preview's card grids", () => {
    const preview = readSource("components/demo/DemoSeekerPreview.tsx");
    for (const handler of [
      "onOpen",
      "onHostClick",
      "onHousingClick",
      "onMealsClick",
      "onPayClick",
      "onLocationClick",
      "onReport",
    ]) {
      expect(preview, `${handler} is not overridden`).toContain(`${handler}:`);
    }
  });
});
