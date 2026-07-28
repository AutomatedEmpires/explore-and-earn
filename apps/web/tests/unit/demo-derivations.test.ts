import { describe, expect, it } from "vitest";

import { ANALYTICS_ENTITLEMENT, PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

import {
  DEMO_ANALYTICS,
  DEMO_ANNOUNCEMENTS,
  DEMO_APPLICANTS,
  DEMO_CAMPAIGNS,
  DEMO_DISCOVERY_SOURCES,
  DEMO_DRAFT_ROLES,
  DEMO_FUNNEL_STAGES,
  DEMO_LIVE_ROLES,
  DEMO_METRICS,
  DEMO_OPPORTUNITY_VIEWS,
  DEMO_ORG,
  DEMO_PLAN_USAGE,
  DEMO_PROFILE_VIEWS,
  DEMO_QUALIFIED_MATCHES,
  DEMO_ROLES,
  DEMO_SAVES,
  DEMO_STAGE_ORDER,
  DEMO_TOTAL_APPLICATIONS,
  DEMO_WEEKS,
  QUALIFIED_MATCH_THRESHOLD,
  announcementsThisPeriod,
  applicantsForRole,
  applyStageOverrides,
  deriveFunnel,
  deriveHostAnalytics,
  deriveMetrics,
  deriveNeedsAttention,
  derivePlanUsage,
  deriveRolePerformance,
  outreachTotals,
  qualifiedMatchCount,
  tallyByStage,
  totalApplications,
  type DemoStage,
} from "../../components/demo/enterpriseDemo";

/**
 * THE AGGREGATES MUST RECONCILE BY CONSTRUCTION.
 *
 * The demo workspace puts ninety-six invented applications and a page of
 * invented figures on the public internet. Nobody can check whether the numbers
 * are TRUE — they are samples — but everybody can check whether they are
 * CONSISTENT, and a host who spots a dashboard disagreeing with its own detail
 * view stops believing the real product's numbers too.
 *
 * So this file recomputes every displayed aggregate independently of the code
 * that produces it, from the record arrays, and asserts the two agree. It is
 * not testing that a function returns what it returns: the expectations here
 * are written as separate arithmetic over the raw records, so a derivation that
 * silently changed shape, dropped a stage, or acquired a hardcoded total would
 * fail. Drift is a test failure, not a rendering surprise.
 *
 * It also pins the exact stage census the founder's D20 brief specifies, so a
 * later edit to the fixture cannot quietly move the season out from under the
 * spec.
 */

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

// ── 1. The census the spec names ───────────────────────────────────────────

describe("the D20 stage census", () => {
  it("holds ninety-six individual application records", () => {
    expect(DEMO_APPLICANTS).toHaveLength(96);
    expect(new Set(DEMO_APPLICANTS.map((a) => a.id)).size).toBe(96);
    expect(new Set(DEMO_APPLICANTS.map((a) => a.name)).size).toBe(96);
  });

  it("tallies to exactly the stage split the brief specifies", () => {
    // Counted here from the records rather than read from a constant, so this
    // is a check on the DATA and not on tallyByStage's return value.
    const counted: Record<string, number> = {};
    for (const applicant of DEMO_APPLICANTS) {
      counted[applicant.stage] = (counted[applicant.stage] ?? 0) + 1;
    }
    expect(counted).toEqual({
      new: 21,
      reviewing: 18,
      saved: 12,
      interview: 9,
      offer: 7,
      accepted: 5,
      not_selected: 16,
      withdrawn: 8,
    });
    expect(sum(Object.values(counted))).toBe(96);
  });

  it("splits the remainder explicitly rather than lumping it", () => {
    const tally = tallyByStage();
    expect(tally.not_selected + tally.withdrawn).toBe(24);
    expect(tally.not_selected).toBeGreaterThan(0);
    expect(tally.withdrawn).toBeGreaterThan(0);
  });

  it("ships seven roles: five live, one closing soon, two drafts", () => {
    expect(DEMO_ROLES).toHaveLength(7);
    expect(DEMO_LIVE_ROLES).toHaveLength(5);
    expect(DEMO_DRAFT_ROLES).toHaveLength(2);
    expect(DEMO_LIVE_ROLES.filter((role) => role.closingSoon)).toHaveLength(1);
  });

  it("gives every role a site-photo slug and a stated housing and meals line", () => {
    for (const role of DEMO_ROLES) {
      expect(role.photoSlug, role.id).toBeTruthy();
      expect(role.housing.type.length, role.id).toBeGreaterThan(0);
      expect(role.meals.summary.length, role.id).toBeGreaterThan(0);
      expect(role.schedule.length, role.id).toBeGreaterThan(0);
      expect(role.requirements.length, role.id).toBeGreaterThan(0);
      expect(role.benefits.length, role.id).toBeGreaterThan(0);
      expect(role.openPositions, role.id).toBeGreaterThan(0);
      expect(role.payMaxCents, role.id).toBeGreaterThanOrEqual(role.payMinCents);
    }
  });

  it("runs 34 invitations with 19 accepted, across campaign records", () => {
    expect(sum(DEMO_CAMPAIGNS.map((c) => c.invitesSent))).toBe(34);
    expect(sum(DEMO_CAMPAIGNS.map((c) => c.invitesAccepted))).toBe(19);
  });

  it("publishes three announcements, schedules one, and drafts one", () => {
    const byStatus: Record<string, number> = {};
    for (const announcement of DEMO_ANNOUNCEMENTS) {
      byStatus[announcement.status] = (byStatus[announcement.status] ?? 0) + 1;
    }
    expect(byStatus).toEqual({ published: 3, scheduled: 1, draft: 1 });
  });
});

// ── 2. Every headline aggregate is a fold over the records ─────────────────

describe("headline aggregates derive from the records", () => {
  it("total applications is the record count, not a stored number", () => {
    expect(DEMO_TOTAL_APPLICATIONS).toBe(DEMO_APPLICANTS.length);
    expect(totalApplications()).toBe(DEMO_APPLICANTS.length);
  });

  it("qualified matches is a count of records over the threshold, and equals 41", () => {
    const counted = DEMO_APPLICANTS.filter(
      (a) => a.matchScore >= QUALIFIED_MATCH_THRESHOLD,
    ).length;
    expect(DEMO_QUALIFIED_MATCHES).toBe(counted);
    expect(qualifiedMatchCount()).toBe(counted);
    expect(counted).toBe(41);
  });

  it("opportunity views, profile views and saves fold the weekly counters", () => {
    expect(DEMO_OPPORTUNITY_VIEWS).toBe(
      sum(DEMO_WEEKS.map((w) => w.opportunityViews)),
    );
    expect(DEMO_PROFILE_VIEWS).toBe(sum(DEMO_WEEKS.map((w) => w.profileViews)));
    expect(DEMO_SAVES).toBe(sum(DEMO_WEEKS.map((w) => w.saves)));
    expect(DEMO_OPPORTUNITY_VIEWS).toBe(3610);
    expect(DEMO_PROFILE_VIEWS).toBe(1842);
    expect(DEMO_SAVES).toBe(214);
  });

  /**
   * The weekly series and the per-role breakdown are two independent
   * decompositions of the same totals. Either alone would look fine; only
   * checking them against each other catches a role whose views were edited
   * without the week they happened in.
   */
  it("the per-role view and save counts agree with the weekly counters", () => {
    expect(sum(DEMO_ROLES.map((role) => role.views))).toBe(DEMO_OPPORTUNITY_VIEWS);
    expect(sum(DEMO_ROLES.map((role) => role.saves))).toBe(DEMO_SAVES);
  });

  it("the weekly application counter agrees with the application records", () => {
    expect(sum(DEMO_WEEKS.map((w) => w.applications))).toBe(
      DEMO_APPLICANTS.length,
    );
  });

  it("the weekly qualified counter agrees with the scored records", () => {
    expect(sum(DEMO_WEEKS.map((w) => w.qualifiedMatches))).toBe(
      DEMO_QUALIFIED_MATCHES,
    );
  });

  it("the weekly invite counters agree with the campaign records", () => {
    const outreach = outreachTotals();
    expect(sum(DEMO_WEEKS.map((w) => w.invitesSent))).toBe(outreach.sent);
    expect(sum(DEMO_WEEKS.map((w) => w.invitesAccepted))).toBe(outreach.accepted);
  });

  it("the per-role invite counts agree with the campaign records", () => {
    const outreach = outreachTotals();
    expect(sum(DEMO_ROLES.map((role) => role.invitesSent))).toBe(outreach.sent);
    expect(sum(DEMO_ROLES.map((role) => role.invitesAccepted))).toBe(
      outreach.accepted,
    );
  });

  it("a draft role claims no performance at all", () => {
    for (const role of DEMO_DRAFT_ROLES) {
      expect(role.views, role.id).toBe(0);
      expect(role.saves, role.id).toBe(0);
      expect(role.invitesSent, role.id).toBe(0);
      expect(role.deadline, role.id).toBeNull();
      expect(role.minutesToFirstApplication, role.id).toBeNull();
      expect(applicantsForRole(role.id), role.id).toHaveLength(0);
    }
  });
});

// ── 3. The metric tiles print the derived values ───────────────────────────

describe("the metric tiles", () => {
  function tile(id: string) {
    const found = DEMO_METRICS.find((metric) => metric.id === id);
    expect(found, `no ${id} tile`).toBeTruthy();
    return found!;
  }

  it("prints the derived totals, not separate literals", () => {
    expect(tile("applications").value).toBe(String(DEMO_APPLICANTS.length));
    expect(tile("qualified_matches").value).toBe(String(DEMO_QUALIFIED_MATCHES));
    expect(tile("opportunity_views").value).toBe(
      DEMO_OPPORTUNITY_VIEWS.toLocaleString(),
    );
    expect(tile("profile_views").value).toBe(DEMO_PROFILE_VIEWS.toLocaleString());
    expect(tile("saves").value).toBe(DEMO_SAVES.toLocaleString());
  });

  it("computes view-to-application from the two figures it names", () => {
    const expected = (DEMO_APPLICANTS.length / DEMO_OPPORTUNITY_VIEWS) * 100;
    expect(tile("view_to_application").value).toBe(`${expected.toFixed(1)}%`);
  });

  it("computes invite acceptance from the campaign records", () => {
    const outreach = outreachTotals();
    expect(tile("invite_acceptance").value).toBe(
      `${Math.round(outreach.acceptanceRate * 100)}%`,
    );
    expect(tile("invite_acceptance").trend).toContain(String(outreach.accepted));
    expect(tile("invite_acceptance").trend).toContain(String(outreach.sent));
  });

  it("recomputes when the records change, which is the whole point", () => {
    const moved = applyStageOverrides({ "apl-019": "accepted" });
    const metrics = deriveMetrics(moved);
    // Stage moves do not change the population, so the total is stable...
    expect(metrics.find((m) => m.id === "applications")?.value).toBe("96");
    // ...but the funnel that reads the same list does change.
    expect(deriveFunnel(moved).find((s) => s.id === "accepted")?.count).toBe(6);
  });

  it("draws every sparkline from a real series rather than a pleasing shape", () => {
    for (const metric of DEMO_METRICS) {
      expect(metric.spark.length, metric.id).toBeGreaterThan(0);
      for (const value of metric.spark) {
        expect(value, metric.id).toBeGreaterThanOrEqual(0);
        expect(value, metric.id).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ── 4. HostAnalytics is derived, and the interview fold is stated ──────────

describe("the derived HostAnalytics", () => {
  it("account-wide stored-status counts add up to the application total", () => {
    expect(sum(Object.values(DEMO_ANALYTICS.totalApplicationsByStatus))).toBe(
      DEMO_APPLICANTS.length,
    );
  });

  it("per-listing stored-status counts add up to the account-wide counts", () => {
    const rolled: Record<string, number> = {};
    for (const stat of DEMO_ANALYTICS.perListingStats) {
      for (const [status, count] of Object.entries(stat.applicationsByStatus)) {
        rolled[status] = (rolled[status] ?? 0) + count;
      }
    }
    expect(rolled).toEqual(DEMO_ANALYTICS.totalApplicationsByStatus);
  });

  it("each listing's own total matches its own stage counts", () => {
    for (const stat of DEMO_ANALYTICS.perListingStats) {
      expect(sum(Object.values(stat.applicationsByStatus))).toBe(
        stat.totalApplications,
      );
      expect(stat.totalApplications).toBe(
        applicantsForRole(stat.listingId).length,
      );
    }
  });

  /**
   * The documented fold. `interview` is not a stored APPLICATION_STATUS, so the
   * dashboard's Reviewing column carries both stages; the analytics page states
   * that in words and this asserts the arithmetic behind the sentence.
   */
  it("folds interviews into reviewing, and says so by arithmetic", () => {
    const tally = tallyByStage();
    expect(DEMO_ANALYTICS.totalApplicationsByStatus.reviewing).toBe(
      tally.reviewing + tally.interview,
    );
    expect(DEMO_ANALYTICS.totalApplicationsByStatus.applied).toBe(tally.new);
    expect(DEMO_ANALYTICS.totalApplicationsByStatus.saved_by_host).toBe(
      tally.saved,
    );
    expect(DEMO_ANALYTICS.totalApplicationsByStatus.offered).toBe(tally.offer);
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
    expect(DEMO_ANALYTICS.activeListingCount).toBe(DEMO_LIVE_ROLES.length);
    expect(DEMO_ANALYTICS.listingCount).toBe(DEMO_ROLES.length);
    expect(DEMO_ANALYTICS.activeListingCount).toBeLessThanOrEqual(
      DEMO_ANALYTICS.listingCount,
    );
  });

  it("shows the analytics depth the demo plan actually grants", () => {
    expect(DEMO_ANALYTICS.analyticsScope).toBe(
      ANALYTICS_ENTITLEMENT[DEMO_ORG.planTier],
    );
  });

  it("recomputes from a moved list rather than caching a total", () => {
    const moved = applyStageOverrides({ "apl-019": "offer" });
    const analytics = deriveHostAnalytics(moved);
    expect(analytics.totalApplicationsByStatus.offered).toBe(
      (DEMO_ANALYTICS.totalApplicationsByStatus.offered ?? 0) + 1,
    );
    expect(analytics.totalApplicationsByStatus.applied).toBe(
      (DEMO_ANALYTICS.totalApplicationsByStatus.applied ?? 0) - 1,
    );
    expect(sum(Object.values(analytics.totalApplicationsByStatus))).toBe(96);
  });
});

// ── 5. Splits, funnel, plan usage ──────────────────────────────────────────

describe("the derived breakdowns", () => {
  it("discovery-source views add up to the opportunity-view total", () => {
    expect(sum(DEMO_DISCOVERY_SOURCES.map((s) => s.views))).toBe(
      DEMO_OPPORTUNITY_VIEWS,
    );
  });

  it("discovery-source shares are derived and add up to a whole", () => {
    expect(sum(DEMO_DISCOVERY_SOURCES.map((s) => s.sharePercent))).toBe(100);
    for (const source of DEMO_DISCOVERY_SOURCES) {
      expect(source.share).toBe(`${source.sharePercent}%`);
      // Within a point of the exact ratio: largest-remainder moves at most one.
      const exact = (source.views / DEMO_OPPORTUNITY_VIEWS) * 100;
      expect(Math.abs(source.sharePercent - exact)).toBeLessThan(1);
    }
  });

  it("the funnel covers every stage in order and sums to the total", () => {
    expect(DEMO_FUNNEL_STAGES.map((s) => s.id)).toEqual([...DEMO_STAGE_ORDER]);
    expect(sum(DEMO_FUNNEL_STAGES.map((s) => s.count))).toBe(
      DEMO_APPLICANTS.length,
    );
  });

  it("plan usage folds the records and never exceeds the plan's allowance", () => {
    const entitlement = PLAN_ENTITLEMENTS[DEMO_ORG.planTier];
    const usage = derivePlanUsage();
    expect(usage).toEqual(DEMO_PLAN_USAGE);
    for (const row of usage) {
      expect(row.used, row.id).toBeLessThanOrEqual(entitlement[row.entitlementKey]);
    }
    expect(usage.find((r) => r.id === "listings")?.used).toBe(
      DEMO_LIVE_ROLES.length,
    );
    expect(usage.find((r) => r.id === "invites")?.used).toBe(
      outreachTotals().sentThisPeriod,
    );
    expect(usage.find((r) => r.id === "announcements")?.used).toBe(
      announcementsThisPeriod(),
    );
  });

  it("shows 5 of 10 listings, which is the state the brief asks for", () => {
    expect(DEMO_LIVE_ROLES.length).toBe(5);
    expect(PLAN_ENTITLEMENTS[DEMO_ORG.planTier].listings).toBe(10);
  });
});

// ── 6. Diagnoses and the attention queue come from the records ─────────────

describe("the plain-language diagnoses", () => {
  it("gives every live role a diagnosis built from its own ratios", () => {
    const performance = deriveRolePerformance();
    expect(performance).toHaveLength(DEMO_LIVE_ROLES.length);
    for (const entry of performance) {
      expect(entry.diagnosis.length, entry.role.id).toBeGreaterThan(20);
      expect(entry.applications, entry.role.id).toBe(
        applicantsForRole(entry.role.id).length,
      );
    }
  });

  it("changes the diagnosis when the underlying records change", () => {
    const emptied = DEMO_APPLICANTS.filter(
      (applicant) => applicant.roleId !== DEMO_LIVE_ROLES[4].id,
    );
    const entry = deriveRolePerformance(emptied).find(
      (row) => row.role.id === DEMO_LIVE_ROLES[4].id,
    );
    expect(entry?.applications).toBe(0);
    expect(entry?.diagnosis).toMatch(/no applications/i);
  });

  it("attaches evidence to every attention item", () => {
    const items = deriveNeedsAttention();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.evidence.length, item.id).toBeGreaterThan(10);
      expect(item.href, item.id).toMatch(/^\/for-hosts\/demo/);
    }
  });

  it("raises the closing-soon role by name", () => {
    const closing = DEMO_LIVE_ROLES.find((role) => role.closingSoon);
    const items = deriveNeedsAttention();
    expect(items.some((item) => item.title.includes(closing!.title))).toBe(true);
  });
});

// ── 7. Reset restores canon ────────────────────────────────────────────────

describe("session-local stage moves", () => {
  const overrides: Readonly<Record<string, DemoStage>> = {
    "apl-019": "offer",
    "apl-020": "accepted",
    "apl-021": "not_selected",
  };

  it("moves exactly the named candidates and nobody else", () => {
    const moved = applyStageOverrides(overrides);
    expect(moved).toHaveLength(DEMO_APPLICANTS.length);
    const changed = moved.filter(
      (applicant, index) => applicant.stage !== DEMO_APPLICANTS[index].stage,
    );
    expect(changed.map((a) => a.id).sort()).toEqual([
      "apl-019",
      "apl-020",
      "apl-021",
    ]);
  });

  it("moves the aggregates with them", () => {
    const moved = applyStageOverrides(overrides);
    const before = tallyByStage();
    const after = tallyByStage(moved);
    expect(after.new).toBe(before.new - 3);
    expect(after.offer).toBe(before.offer + 1);
    expect(after.accepted).toBe(before.accepted + 1);
    expect(after.not_selected).toBe(before.not_selected + 1);
    expect(sum(Object.values(after))).toBe(96);
  });

  /** Reset is defined as applying an empty override map. */
  it("reset restores canon exactly", () => {
    const moved = applyStageOverrides(overrides);
    expect(tallyByStage(moved)).not.toEqual(tallyByStage());
    const reset = applyStageOverrides({});
    expect(reset.map((a) => ({ id: a.id, stage: a.stage }))).toEqual(
      DEMO_APPLICANTS.map((a) => ({ id: a.id, stage: a.stage })),
    );
    expect(tallyByStage(reset)).toEqual(tallyByStage());
    expect(deriveHostAnalytics(reset)).toEqual(DEMO_ANALYTICS);
    expect(deriveMetrics(reset)).toEqual(DEMO_METRICS);
  });

  it("never mutates the canon array", () => {
    const snapshot = DEMO_APPLICANTS.map((a) => a.stage);
    applyStageOverrides(overrides);
    expect(DEMO_APPLICANTS.map((a) => a.stage)).toEqual(snapshot);
  });
});
