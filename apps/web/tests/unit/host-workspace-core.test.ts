import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  hostProfileCompleteness,
  needsAttention,
  opportunityPerformance,
  pipelineFunnel,
  pulseTiles,
  upcomingEntries,
} from "../../components/host/workspaceModel";
import {
  countClosingSoon,
  countListingsByStatus,
  isListingLifecycleStatus,
  LISTING_LIFECYCLE_LABEL,
  LISTING_LIFECYCLE_STATUSES,
} from "../../components/host/models";
// Deep relative imports, not the package barrel: @explore-and-earn/db's index
// pulls in modules that `import "server-only"`, which vitest cannot load. Both
// of these are pure by design for exactly this reason — the same pattern
// applicant-name-honesty.test.ts uses for lib/hostApplicantView.
import {
  countInWindow,
  derivePulse,
  emptyHostHiringPulse,
  pulseDelta,
  pulseWindows,
} from "../../../../packages/db/src/lib/hostPulse";
import {
  daysUntil,
  listingReadiness,
} from "../../../../packages/db/src/lib/listingReadiness";

/**
 * Redesign V2-F1 — the host workspace core.
 *
 * These pin the two things the previous surfaces got wrong: they showed numbers
 * nothing computed, and they showed the same task twice with different answers.
 * Every assertion below is either "this figure equals the records it claims to
 * summarise" or "this surface has exactly one of that thing".
 */

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * Source with comments removed.
 *
 * EVERY NEGATIVE ASSERTION BELOW MUST USE THIS. Both of the first-draft failures
 * in this file were doc comments: the outreach page explains why the campaign
 * builder was deleted (so it names it), and workspaceModel explains that it does
 * not read `completion_score` (so it names that too). A negative assertion that
 * reads prose is testing the prose — it fails when the code is right and the
 * explanation is good, which is precisely backwards.
 */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const OVERVIEW = source("../../components/host/HostDashboard.tsx");
const OVERVIEW_PAGE = source("../../app/[locale]/(host)/host/page.tsx");
const APPLICANT_CARD = source("../../components/host/HostApplicantCard.tsx");
const APPLICANT_DETAIL = source("../../components/host/HostApplicantDetail.tsx");
const OUTREACH = source("../../app/[locale]/(host)/host/outreach/page.tsx");
const LISTINGS_PAGE = source("../../app/[locale]/(host)/host/listings/page.tsx");
const WORKSPACE_MODEL = source("../../components/host/workspaceModel.ts");
const EVENTS = source("../../lib/analytics/events.ts");

/* ══════════════════════════════════════════════════════════════════════
   1. DEDUPLICATION — one prioritised surface, not two that disagree
   ══════════════════════════════════════════════════════════════════════ */

describe("overview deduplication (D24)", () => {
  it("has no separate setup checklist component left to render", () => {
    // The old surface stacked HostSetupChecklist ("0/3 steps") directly above a
    // "What to do next" panel that could simultaneously say "You're all caught
    // up." Both are now one queue, and the checklist component is deleted so it
    // cannot be re-mounted by accident.
    expect(OVERVIEW).not.toContain("HostSetupChecklist");
    expect(() => source("../../components/host/HostSetupChecklist.tsx")).toThrow();
  });

  it("renders exactly one needs-attention list", () => {
    const listOpens = OVERVIEW.match(/className=\{styles\.attentionList\}/g) ?? [];
    expect(listOpens).toHaveLength(1);
  });

  it("derives the hero's primary action from the top of that same queue", () => {
    // Two independently-computed "next actions" is how the old screen ended up
    // contradicting itself. There is one list, and the CTA is its first item.
    expect(OVERVIEW).toContain("const primary: AttentionItem | undefined = attention[0]");
  });

  it("drops the composite health score entirely", () => {
    // The "conversion radar" averaged three unrelated ratios into one
    // percentage, and awarded 40 points for merely owning a draft.
    for (const ghost of ["conversionScore", "radarInputs", "inventoryPct", "Conversion radar"]) {
      expect(OVERVIEW).not.toContain(ghost);
    }
  });

  it("puts setup steps INSIDE the queue rather than in a parallel widget", () => {
    const items = needsAttention({
      newApplicants: 0,
      offersOutstanding: 0,
      unreadMessages: 0,
      listings: [],
      accountState: "prospect",
      profile: hostProfileCompleteness(null),
    });
    expect(items.map((item) => item.id)).toEqual(["first-listing", "profile"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   2. KPI STRIP — real comparison, honest emptiness
   ══════════════════════════════════════════════════════════════════════ */

describe("hiring pulse", () => {
  const NOW = Date.parse("2026-07-28T00:00:00.000Z");

  it("compares two windows of equal length", () => {
    const w = pulseWindows(NOW, 30);
    const currentSpan = Date.parse(w.now) - Date.parse(w.currentFrom);
    const previousSpan = Date.parse(w.currentFrom) - Date.parse(w.previousFrom);
    expect(currentSpan).toBe(previousSpan);
  });

  it("counts a boundary row exactly once across the two windows", () => {
    const w = pulseWindows(NOW, 30);
    const onTheBoundary = [{ at: w.currentFrom }];
    const inCurrent = countInWindow(onTheBoundary, w.currentFrom, w.now);
    const inPrevious = countInWindow(onTheBoundary, w.previousFrom, w.currentFrom);
    expect(inCurrent + inPrevious).toBe(1);
  });

  it("refuses a percentage when the previous window was empty", () => {
    // "+100%" from zero is a sentence about nothing, and rendering it next to a
    // real percentage invites the two to be read as comparable.
    expect(pulseDelta(7, 0).changePercent).toBeNull();
    expect(pulseDelta(7, 4).changePercent).toBe(75);
  });

  it("says 'no activity either period' rather than 0% when both are empty", () => {
    const pulse = derivePulse(
      {
        applications: [],
        invitesCreated: [],
        invitesResponded: [],
        listingsPublished: [],
        hasListings: true,
      },
      pulseWindows(NOW, 30),
    );
    const tiles = pulseTiles(pulse);
    expect(tiles.every((tile) => tile.trend === null)).toBe(true);
    expect(OVERVIEW).toContain("No activity either period");
  });

  it("falls back to a plain prior count, never a fabricated ratio", () => {
    const pulse = derivePulse(
      {
        applications: [{ at: new Date(NOW - 1000).toISOString() }],
        invitesCreated: [],
        invitesResponded: [],
        listingsPublished: [],
        hasListings: true,
      },
      pulseWindows(NOW, 30),
    );
    const applications = pulseTiles(pulse).find((tile) => tile.id === "applications");
    expect(applications?.value).toBe(1);
    expect(applications?.trend).toBe("vs 0 before");
  });

  it("marks a host with no listings unmeasurable instead of showing four zeros", () => {
    const empty = emptyHostHiringPulse(30, NOW);
    expect(empty.measurable).toBe(false);
    // The component branches on exactly this flag to teach instead of scoring.
    expect(OVERVIEW).toContain("pulse.measurable ?");
    expect(OVERVIEW).toContain("Nothing to compare yet");
  });

  it("every tile links somewhere it can be drilled into", () => {
    const pulse = emptyHostHiringPulse(30, NOW);
    for (const tile of pulseTiles(pulse)) {
      expect(tile.href.startsWith("/host/")).toBe(true);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
   3. PIPELINE FUNNEL — sums to its own records
   ══════════════════════════════════════════════════════════════════════ */

describe("pipeline funnel", () => {
  const byStatus = {
    applied: 21,
    reviewing: 18,
    saved_by_host: 12,
    offered: 7,
    accepted: 5,
    active: 2,
    completed: 1,
    not_selected: 9,
    withdrawn: 3,
    expired: 1,
  };

  it("accounts for every stored application exactly once", () => {
    const funnel = pipelineFunnel(byStatus);
    const stepTotal = funnel.steps.reduce((sum, step) => sum + step.count, 0);
    expect(stepTotal + funnel.closed).toBe(funnel.total);
    expect(funnel.total).toBe(
      Object.values(byStatus).reduce((sum, n) => sum + n, 0),
    );
  });

  it("folds engagement states into 'accepted' rather than dropping them", () => {
    const funnel = pipelineFunnel(byStatus);
    const accepted = funnel.steps.find((step) => step.id === "accepted");
    expect(accepted?.count).toBe(
      byStatus.accepted + byStatus.active + byStatus.completed,
    );
  });

  it("keeps closed candidacies out of the steps but inside the total", () => {
    // A passed-over candidate did not reach a later stage; putting them in a bar
    // would stop the funnel summing to itself.
    const funnel = pipelineFunnel(byStatus);
    expect(funnel.closed).toBe(
      byStatus.not_selected + byStatus.withdrawn + byStatus.expired,
    );
    expect(funnel.steps.some((step) => step.label.toLowerCase().includes("closed"))).toBe(
      false,
    );
  });

  it("reports 0% rather than dividing by zero on an empty pipeline", () => {
    const funnel = pipelineFunnel({});
    expect(funnel.total).toBe(0);
    expect(funnel.advancedPercent).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   4. MATCH EXPLANATION — never a bare score
   ══════════════════════════════════════════════════════════════════════ */

describe("match reading (G34)", () => {
  it("derives reasons from the stored components at render time", () => {
    expect(APPLICANT_CARD).toContain("topMatchReasons");
    expect(APPLICANT_DETAIL).toContain("topMatchReasons");
  });

  it("shows no reason at all when no components were stored", () => {
    // The failure mode this guards is a sentence reverse-engineered from the
    // number — an explanation nobody computed.
    expect(APPLICANT_CARD).toContain("No component breakdown was recorded");
    expect(APPLICANT_DETAIL).toContain("No component breakdown was recorded");
  });

  it("never renders a score without the band that reads it", () => {
    // The band ("Strong fit") is the human-readable verdict; the raw figure is
    // supporting detail beside it, never the headline on its own.
    const scoreIndex = APPLICANT_CARD.indexOf("styles.matchScore");
    const bandIndex = APPLICANT_CARD.indexOf("styles.matchBand");
    expect(bandIndex).toBeGreaterThan(-1);
    expect(bandIndex).toBeLessThan(scoreIndex);
  });

  it("carries the components through the db layer with the score", () => {
    const query = readFileSync(
      new URL("../../../../packages/db/src/queries/matchScores.ts", import.meta.url),
      "utf8",
    );
    expect(query).toContain("score, band, confidence, components");
    expect(query).toContain("components: toComponentScores(raw.components)");
  });

  it("gates the reading on the SAME entitlement function analytics uses", () => {
    const page = source("../../app/[locale]/(host)/host/applicants/page.tsx");
    expect(page).toContain('analyticsScopeForTier(subscriptionTier) === "full"');
  });
});

/* ══════════════════════════════════════════════════════════════════════
   5. TRANSITIONS STAY SERVER-ENFORCED
   ══════════════════════════════════════════════════════════════════════ */

describe("stage moves", () => {
  it("offers no drag-and-drop that could express an illegal edge", () => {
    const board = source("../../components/host/HostPipelineBoard.tsx");
    for (const dnd of ["onDrop", "draggable", "onDragStart", "dnd"]) {
      expect(board).not.toContain(dnd);
    }
  });

  it("still renders only edges legalCardActions permits", () => {
    const actions = source("../../components/host/HostApplicantCardActions.tsx");
    expect(actions).toContain("legalCardActions(status)");
    expect(actions).toContain("if (actions.length === 0) return null");
  });

  it("captures the stage-change event only after the server accepted it", () => {
    const actions = source("../../components/host/HostApplicantCardActions.tsx");
    const okBranch = actions.indexOf("if (result.ok)");
    const capture = actions.indexOf("candidateStageChanged");
    expect(okBranch).toBeGreaterThan(-1);
    expect(capture).toBeGreaterThan(okBranch);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   6. LISTING HEALTH — the real lifecycle, and no over-claiming
   ══════════════════════════════════════════════════════════════════════ */

describe("listing readiness", () => {
  const NOW = Date.parse("2026-07-28T00:00:00.000Z");
  const complete = {
    status: "draft",
    provenance: "verified",
    housingEvidence: "confirmed",
    housingIncluded: false,
    mealsEvidence: "confirmed",
    payEvidence: "confirmed",
    payMinCents: 2100,
    coverPhotoUrl: "https://example.invalid/cover.jpg",
    locationDisplay: "Coeur d'Alene, Idaho",
    beginsAt: "2026-05-01T00:00:00.000Z",
  };

  it("finds nothing wrong with a complete listing", () => {
    const verdict = listingReadiness(complete, NOW);
    expect(verdict.gaps).toEqual([]);
    expect(verdict.blockingCount).toBe(0);
  });

  it("names each unanswered triad field as a publication blocker", () => {
    const verdict = listingReadiness(
      { ...complete, mealsEvidence: "not_stated" },
      NOW,
    );
    const meals = verdict.gaps.find((gap) => gap.field === "meals");
    expect(meals?.blocksPublication).toBe(true);
  });

  it("treats a missing cover as a weakness, not a blocker", () => {
    const verdict = listingReadiness({ ...complete, coverPhotoUrl: null }, NOW);
    const cover = verdict.gaps.find((gap) => gap.field === "cover");
    expect(cover?.blocksPublication).toBe(false);
    expect(verdict.blockingCount).toBe(0);
  });

  it("never invents missing housing photos it cannot read", () => {
    // The four evidence-photo roles live behind a per-listing RPC (migration
    // 072 revoked the raw column). An unread map decodes as "all four missing",
    // which would put a false blocker on every housing listing that has them.
    const verdict = listingReadiness({ ...complete, housingIncluded: true }, NOW);
    expect(verdict.gaps.some((gap) => /photo/i.test(gap.reason))).toBe(false);
    expect(verdict.photoEvidencePending).toBe(true);
  });

  it("says the photo check is deferred rather than claiming readiness", () => {
    const card = source("../../components/host/HostListingCard.tsx");
    expect(card).toContain("readiness.photoEvidencePending");
    expect(card).toContain("checked when you publish");
  });

  it("derives closing-soon from the real deadline, live listings only", () => {
    const soon = { ...complete, status: "live", expiresAt: new Date(NOW + 5 * 86_400_000).toISOString() };
    expect(listingReadiness(soon, NOW).closingSoon).toBe(true);
    expect(listingReadiness({ ...soon, status: "draft" }, NOW).closingSoon).toBe(false);
    expect(
      listingReadiness(
        { ...soon, expiresAt: new Date(NOW + 60 * 86_400_000).toISOString() },
        NOW,
      ).closingSoon,
    ).toBe(false);
  });

  it("treats a past deadline as no deadline, never as negative days", () => {
    expect(daysUntil(new Date(NOW - 86_400_000).toISOString(), NOW)).toBeNull();
  });
});

describe("listing lifecycle vocabulary", () => {
  it("covers every stored status the database allows", () => {
    // migration 006: draft | under_review | live | paused | closed | archived.
    expect([...LISTING_LIFECYCLE_STATUSES]).toEqual([
      "draft",
      "under_review",
      "live",
      "paused",
      "closed",
      "archived",
    ]);
  });

  it("gives paused and archived distinct labels", () => {
    // The old surface folded both into "Closed" via dbStatusToHostState, so a
    // paused listing could not be found at all.
    expect(LISTING_LIFECYCLE_LABEL.paused).not.toBe(LISTING_LIFECYCLE_LABEL.archived);
    expect(LISTING_LIFECYCLE_LABEL.under_review).not.toBe(LISTING_LIFECYCLE_LABEL.draft);
  });

  it("tallies by the stored status so a tab count matches its rows", () => {
    const items = [
      { listing: { id: "a", status: "live", title: "A" }, state: "open", applicantCount: 0, newApplicantCount: 0 },
      { listing: { id: "b", status: "paused", title: "B" }, state: "closed", applicantCount: 0, newApplicantCount: 0 },
      { listing: { id: "c", status: "archived", title: "C" }, state: "closed", applicantCount: 0, newApplicantCount: 0 },
    ] as never;
    const counts = countListingsByStatus(items);
    expect(counts.live).toBe(1);
    expect(counts.paused).toBe(1);
    expect(counts.archived).toBe(1);
    expect(countClosingSoon(items)).toBe(0);
  });

  it("rejects a status outside the stored vocabulary", () => {
    expect(isListingLifecycleStatus("live")).toBe(true);
    expect(isListingLifecycleStatus("partially_filled")).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   7. NO FABRICATED SOURCES (source scans)
   ══════════════════════════════════════════════════════════════════════ */

describe("no fabricated data sources", () => {
  it("the real workspace never imports the demo fixtures", () => {
    for (const file of [OVERVIEW, OVERVIEW_PAGE, OUTREACH, LISTINGS_PAGE, WORKSPACE_MODEL]) {
      expect(file).not.toContain("components/demo");
      expect(file).not.toContain("enterpriseDemo");
    }
  });

  it("shows a real host no weather widget", () => {
    // The demo's forecast is labelled "Sample data" because no provider is
    // wired. A sample-labelled forecast in a paying host's workspace is worse
    // than none at all.
    expect(OVERVIEW).not.toContain("WeatherWidget");
    expect(OVERVIEW_PAGE).not.toContain("WeatherWidget");
  });

  it("never renders a stock photograph where a host's own cover belongs", () => {
    // The photo catalog's honesty rule forbids presenting a scene as this
    // host's place. Since redesign W2 the rule is stronger than guidance:
    // with no cover, NOTHING renders where the cover would go (the missing
    // cover is the profile attention item's job), and the cover band is
    // gated on the host's own photo.
    expect(OVERVIEW).not.toContain("SitePhoto");
    expect(OVERVIEW).toMatch(/\{coverPhotoUrl \? \(/);
    expect(OVERVIEW).not.toContain("/photos/");
  });

  it("claims no announcement scheduling, because none exists", () => {
    // host_announcements has no publish_at / scheduled_at / 'scheduled' status;
    // its expires_at is an END time and 'draft' is a Stripe-webhook state.
    expect(WORKSPACE_MODEL).toContain("NO SCHEDULED ANNOUNCEMENTS");
    const upcoming = upcomingEntries([], Date.now());
    expect(upcoming).toEqual([]);
  });

  it("advertises no team seats, since every tier grants zero", () => {
    expect(OVERVIEW_PAGE).not.toContain("teamSeats");
    expect(OVERVIEW).not.toContain("seats");
  });

  it("omits paid per-listing figures instead of showing them as zero", () => {
    const perf = opportunityPerformance(
      [
        {
          listingId: "l1",
          title: "Dock crew",
          status: "live",
          category: "seasonal",
          coverPhotoUrl: null,
          locationDisplay: null,
          beginsAt: null,
          endsAt: null,
          publishedAt: null,
          expiresAt: null,
          readiness: {
            gaps: [],
            blockingCount: 0,
            photoEvidencePending: false,
            daysUntilDeadline: null,
            closingSoon: false,
          },
        },
      ],
      {
        totalApplicationsByStatus: {},
        activeListingCount: 1,
        listingCount: 1,
        inviteAcceptanceRate: 0,
        // The 'basic' scope blanks perListingStats — absent is not zero.
        perListingStats: [],
        analyticsScope: "basic",
      },
      { l1: 4 },
      { l1: 2 },
    );
    expect(perf[0]?.invitesSent).toBeNull();
    expect(perf[0]?.invitesAccepted).toBeNull();
    expect(perf[0]?.applications).toBe(4);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   8. OUTREACH — 'campaign' framing only where a campaign exists
   ══════════════════════════════════════════════════════════════════════ */

describe("outreach honesty (§8)", () => {
  it("no longer ships a builder with no backend", () => {
    // Four <select>s and a <textarea> with a defaultValue, no form action, no
    // submit — its own footnote said "nothing here sends on its own."
    expect(code(OUTREACH)).not.toContain("Campaign builder");
    expect(code(OUTREACH)).not.toContain("campaign-audience");
    expect(code(OUTREACH)).not.toContain("Planning aid");
    expect(code(OUTREACH)).not.toContain("<textarea");
  });

  it("does not present a render-time grouping as a stored campaign", () => {
    // There is no campaigns table and no campaign_id on invites. Grouping the
    // host's own invites by listing is a view, and it says so.
    expect(code(OUTREACH)).not.toContain("Live campaigns");
    expect(OUTREACH).toContain("What came back, by listing");
    expect(OUTREACH).toContain("invites are sent and tracked one at a");
  });

  it("keeps every funnel figure derived from real invite rows", () => {
    expect(OUTREACH).toContain("invites.filter((i) => OPENED_STATUSES.has(i.status))");
    expect(OUTREACH).toContain('invites.filter((i) => i.status === "applied")');
  });

  it("teaches from a compact starting state that links the demo", () => {
    expect(OUTREACH).toContain("Nothing to reach out about yet");
    expect(OUTREACH).toContain("/for-hosts/demo/outreach");
  });

  it("captures the invite event only after the credit was actually spent", () => {
    const sourcing = source("../../components/host/MatchedSeekerSourcing.tsx");
    const ok = sourcing.indexOf("if (result.ok)");
    const capture = sourcing.indexOf("inviteSent");
    expect(capture).toBeGreaterThan(ok);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   9. EVENTS
   ══════════════════════════════════════════════════════════════════════ */

describe("workspace funnel events", () => {
  it("declares the four workspace events, snake_case", () => {
    for (const name of [
      "host_candidate_reviewed",
      "host_candidate_stage_changed",
      "host_invite_sent",
      "listing_health_viewed",
    ]) {
      expect(EVENTS).toContain(`"${name}"`);
    }
  });

  it("keeps the six pre-billing funnel events intact", () => {
    for (const name of [
      "host_plans_viewed",
      "host_browse_first_selected",
      "host_profile_created",
      "host_listing_draft_started",
      "host_activation_banner_clicked",
      "host_checkout_started",
    ]) {
      expect(EVENTS).toContain(`"${name}"`);
    }
  });

  it("carries no personal data in any workspace event property", () => {
    // Comments are stripped first: a negative assertion that reads prose is
    // testing the prose, not the code.
    const code = EVENTS.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    for (const forbidden of ["email", "companyName", "clerkUserId", "userId", "seekerProfileId", "applicantName"]) {
      expect(code).not.toContain(forbidden);
    }
  });

  it("never attaches a candidate's identity or score to a stage change", () => {
    const actions = source("../../components/host/HostApplicantCardActions.tsx");
    const call = actions.slice(
      actions.indexOf("candidateStageChanged"),
      actions.indexOf("candidateStageChanged") + 240,
    );
    expect(call).toContain("from: status");
    expect(call).toContain("to: action.status");
    expect(call).not.toContain("applicantId");
    expect(call).not.toContain("matchScore");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   10. PROFILE COMPLETENESS — a count of fields, not a score
   ══════════════════════════════════════════════════════════════════════ */

describe("profile completeness", () => {
  it("counts fields the host can see, and names the blanks", () => {
    const result = hostProfileCompleteness({
      companyName: "Lakeside Lodge",
      hostName: "Maya",
      tagline: null,
      about: "  ",
      primaryLocationName: "Coeur d'Alene, Idaho",
      photoUrl: null,
    });
    expect(result.total).toBe(6);
    expect(result.filled).toBe(3);
    expect(result.missing).toEqual(["Tagline", "About your operation", "Cover photo"]);
    expect(result.complete).toBe(false);
  });

  it("treats a missing profile as all-blank rather than throwing", () => {
    const result = hostProfileCompleteness(null);
    expect(result.filled).toBe(0);
    expect(result.complete).toBe(false);
  });

  it("reads no completion_score column, because nothing writes one", () => {
    expect(code(WORKSPACE_MODEL)).not.toContain("completion_score");
    expect(WORKSPACE_MODEL).toContain("A COUNT OF REAL FIELDS, NOT A SCORE");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   11. NEEDS-ATTENTION ORDERING AND EVIDENCE
   ══════════════════════════════════════════════════════════════════════ */

describe("needs attention", () => {
  const emptyProfile = hostProfileCompleteness({
    companyName: "A",
    hostName: "B",
    tagline: "C",
    about: "D",
    primaryLocationName: "E",
    photoUrl: "F",
  });

  it("puts a failing payment above everything else", () => {
    const items = needsAttention({
      newApplicants: 9,
      offersOutstanding: 0,
      unreadMessages: 3,
      listings: [],
      accountState: "lapsed",
      profile: emptyProfile,
    });
    expect(items[0]?.id).toBe("billing");
  });

  it("gives every item evidence and a destination", () => {
    const items = needsAttention({
      newApplicants: 4,
      offersOutstanding: 2,
      unreadMessages: 1,
      listings: [],
      accountState: "active",
      profile: emptyProfile,
    });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.evidence.length).toBeGreaterThan(0);
      expect(item.href.startsWith("/host/")).toBe(true);
    }
  });

  it("is empty for a host with nothing outstanding", () => {
    const items = needsAttention({
      newApplicants: 0,
      offersOutstanding: 0,
      unreadMessages: 0,
      listings: [
        {
          listingId: "l1",
          title: "Dock crew",
          status: "live",
          category: "seasonal",
          coverPhotoUrl: null,
          locationDisplay: null,
          beginsAt: null,
          endsAt: null,
          publishedAt: null,
          expiresAt: null,
          readiness: {
            gaps: [],
            blockingCount: 0,
            photoEvidencePending: false,
            daysUntilDeadline: null,
            closingSoon: false,
          },
        },
      ],
      accountState: "active",
      profile: emptyProfile,
    });
    expect(items).toEqual([]);
  });
});
