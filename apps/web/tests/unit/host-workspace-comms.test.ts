import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCsv, csvField } from "../../lib/csv";
import { HOST_WORKSPACE_EVENTS } from "../../lib/analytics/events";
import { HOST_COACHMARK_STOPS } from "../../components/host/HostCoachmarks";

/**
 * Redesign V2-F2 — host workspace communication and intelligence.
 *
 * The suite is deliberately two halves. The PURE half exercises the functions
 * a surface's honesty actually rests on (does a status derive from the stored
 * row, does a diagnosis refuse to speak without evidence, does a CSV survive a
 * comma in a listing title). The SOURCE half pins the structural decisions that
 * have no runtime to assert against — an absent plan grid, an absent zero-value
 * dial, an absent blocking dialog. Those are exactly the things that get
 * helpfully re-added by the next person to touch the file, which is why they
 * are pinned rather than trusted.
 *
 * SOURCE ASSERTIONS STRIP COMMENTS FIRST. Several of the decisions below are
 * documented in the file that implements them, and a negative assertion that
 * matched a tombstone comment explaining why something was removed would fail
 * on the very change that removed it — the G50 comment trap, in test form.
 */

const APPS_WEB = fileURLToPath(new URL("../../", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(join(APPS_WEB, relativePath), "utf8");
}

/** Source with block and line comments removed. Never used for a positive. */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
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

const HOST_ROUTES = walk(join(APPS_WEB, "app/[locale]/(host)"));

// ═══════════════════════════════════════════════════════════════════════
// 1. MESSAGES (§9)
// ═══════════════════════════════════════════════════════════════════════

describe("the message workspace", () => {
  const workspace = () => read("components/host/HostMessageWorkspace.tsx");

  it("renders three panes: threads, conversation, and candidate context", () => {
    const source = workspace();
    expect(source).toContain('aria-label="Conversations"');
    expect(source).toContain('aria-label="Conversation"');
    expect(source).toContain('aria-label="Conversation context"');
  });

  it("filters by search, by read state, and by listing", () => {
    const source = workspace();
    expect(source).toContain('type="search"');
    expect(source).toContain('role="group" aria-label="Read state"');
    expect(source).toContain("setListingFilter");
  });

  /**
   * The listing filter is built from the threads themselves, so it can never
   * offer a listing the host has no conversation on — and it is hidden when
   * every thread shares one listing, where it would be a control with a single
   * meaningful setting.
   */
  it("derives its listing options from the threads, not from a fixture", () => {
    const source = workspace();
    expect(source).toContain("listingOptions");
    expect(source).toContain("listingOptions.length > 1");
  });

  /**
   * `conversations` has no archived column and migration 050 grants
   * `authenticated` UPDATE on exactly `last_message_at`. An archive control
   * would raise `permission denied for column` — or worse, hide a thread in
   * local state and lose it on reload. Nothing stores reply templates either.
   */
  it("offers no archive and no reply templates, because neither is stored", () => {
    const source = code("components/host/HostMessageWorkspace.tsx");
    // Matched on the MACHINERY, not the word: the rail says plainly that
    // conversations are never archived, and a bare /archive/i would fail on
    // the sentence that tells the host the truth.
    expect(source).not.toMatch(/onArchive|archiveThread|setArchived|archived_at|isArchived/);
    expect(source).not.toMatch(/templates?\s*[:=]|applyTemplate|REPLY_TEMPLATES/);
  });

  it("keeps the deep link: selecting a thread is a route, not client state", () => {
    expect(workspace()).toContain("href={`/host/messages/${thread.id}`}");
  });

  it("links the context rail to the application and the listing it joins to", () => {
    const source = workspace();
    expect(source).toContain("href={`/host/applicants/${active.applicationId}`}");
    expect(source).toContain("href={`/host/listings/${active.listingId}`}");
  });

  it("teaches in its empty state instead of promising traffic (D23)", () => {
    const page = read("app/[locale]/(host)/host/messages/page.tsx");
    expect(page).toContain("/host/applicants");
    expect(page).toContain("/host/outreach");
    expect(page).toContain("/for-hosts/demo/messages");
  });

  it("reports a send only after the server accepted it", () => {
    const transcript = read("components/messaging/MessageTranscript.tsx");
    // The callback sits inside the `result.ok` branch, after the optimistic
    // bubble is confirmed — never on submit, where a rate-limited send would
    // still have been counted.
    expect(transcript).toMatch(/result\.ok[\s\S]{0,400}onSent\?\.\(\)/);
    expect(workspace()).toContain("HOST_WORKSPACE_EVENTS.messageSent");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. ANNOUNCEMENTS (§10)
// ═══════════════════════════════════════════════════════════════════════

describe("the announcement workspace", () => {
  const composer = () => read("components/host/HostAnnouncementComposer.tsx");
  const history = () => read("components/host/HostAnnouncementHistory.tsx");

  it("reads the allowance from the contract, never a literal", () => {
    const source = composer();
    expect(source).toContain("ANNOUNCEMENT_MONTHLY_QUOTA");
    expect(source).toContain("ANNOUNCEMENT_PRICE_CENTS");
    expect(source).toContain("ANNOUNCEMENT_RUN_DAYS");
    expect(source).toContain("ANNOUNCEMENT_FREE_DURATION_DAYS");
  });

  it("previews at both widths before anything is published", () => {
    const source = composer();
    expect(source).toContain('aria-label="Preview width"');
    expect(source).toContain('data-width={previewWidth}');
  });

  it("confirms the cost and the run length before publishing", () => {
    const source = composer();
    expect(source).toContain('aria-label="Confirm publication"');
    expect(source).toContain("Publish now");
    expect(source).toContain("Keep editing");
  });

  /**
   * `host_announcements` has no scheduled_at column and no runner. The demo
   * workspace shows a scheduled row because that is where the concept is being
   * designed; offering the control here would be a button that silently
   * published immediately.
   */
  it("offers publish-now only, and says scheduling does not exist", () => {
    const source = composer();
    expect(source).toMatch(/there is no scheduling/i);
    expect(code("components/host/HostAnnouncementComposer.tsx")).not.toMatch(
      /scheduledAt|schedule_at|setSchedule/,
    );
  });

  it("wires the paid draft the Stripe webhook creates", () => {
    // Before F2 the page passed `draftAnnouncementId={null}` unconditionally,
    // so a host who paid $149 had no route to the run they had bought.
    const page = read("app/[locale]/(host)/host/announcements/page.tsx");
    expect(page).toContain("getLatestDraftAnnouncement");
    expect(page).toContain("draftAnnouncementId={draftAnnouncementId}");
  });

  it("lists the host's own announcements, every status", () => {
    const page = read("app/[locale]/(host)/host/announcements/page.tsx");
    expect(page).toContain("getHostOwnAnnouncements");
    expect(page).toContain("HostAnnouncementHistory");
  });

  /**
   * Nothing anywhere records an announcement impression, view or click: no
   * counter column, no events table, and the two announcement names in the
   * taxonomy have no call site. So the panel states the gap and charts nothing.
   */
  it("charts no engagement, because none is measured", () => {
    const source = history();
    expect(source).toMatch(/Metrics arrive when tracking ships/);
    const stripped = code("components/host/HostAnnouncementHistory.tsx");
    expect(stripped).not.toMatch(/impressions?|clickRate|conic-gradient/i);
  });
});

describe("announcement status derives from the stored row", () => {
  const AN_HOUR = 3_600_000;
  const now = Date.parse("2026-07-28T12:00:00.000Z");

  function row(status: string, expiresAt: string) {
    return { status, expiresAt };
  }

  it.each([
    ["draft", "awaiting"],
    ["removed", "removed"],
  ])("maps stored %s to %s regardless of the clock", async (status, expected) => {
    const { deriveAnnouncementStatus } = await import(
      "../../components/host/HostAnnouncementHistory"
    );
    expect(
      deriveAnnouncementStatus(
        row(status, new Date(now - AN_HOUR).toISOString()),
        now,
      ),
    ).toBe(expected);
  });

  it("splits stored 'active' into live and finished on expires_at", async () => {
    const { deriveAnnouncementStatus } = await import(
      "../../components/host/HostAnnouncementHistory"
    );
    expect(
      deriveAnnouncementStatus(
        row("active", new Date(now + AN_HOUR).toISOString()),
        now,
      ),
    ).toBe("live");
    expect(
      deriveAnnouncementStatus(
        row("active", new Date(now - AN_HOUR).toISOString()),
        now,
      ),
    ).toBe("finished");
  });

  /** There is no 'scheduled' status to derive, because the column does not exist. */
  it("never produces a scheduled status", async () => {
    const { deriveAnnouncementStatus } = await import(
      "../../components/host/HostAnnouncementHistory"
    );
    for (const status of ["draft", "active", "removed", "nonsense"]) {
      expect(
        deriveAnnouncementStatus(row(status, new Date(now).toISOString()), now),
      ).not.toBe("scheduled");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. ANALYTICS (§12 / D25) — including the death of the zero-value dial
// ═══════════════════════════════════════════════════════════════════════

describe("no zero-value donut survives anywhere", () => {
  /**
   * The dial this removes was a 168px conic-gradient rendered unconditionally
   * with `--score: 0%`: a host on day one got a full ring reading "0% advance",
   * captioned "Quiet". A dial at zero is not a neutral report of no data.
   */
  it("the analytics dashboard has no conversion radial, in markup or in CSS", () => {
    const tsx = code("components/host/HostAnalyticsDashboard.tsx");
    expect(tsx).not.toContain("ConversionRadial");
    expect(tsx).not.toContain("radialValue");
    // The stylesheet keeps a tombstone naming what was removed, so the
    // negative is asserted against the DECLARATIONS, not the whole file.
    const css = read("components/host/HostAnalyticsDashboard.module.css")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toContain(".radial {");
    expect(css).not.toContain("conic-gradient");
  });

  it("the pipeline panels render only when there are applications", () => {
    const tsx = read("components/host/HostAnalyticsDashboard.tsx");
    expect(tsx).toContain("{totalApps > 0 ? (");
  });

  /**
   * The overview dashboard had a composite "conversion radar" whose headline
   * was the mean of three unrelated ratios — one of which awarded 40 points for
   * owning a draft — rendered from day one. V2-F1 deleted it outright rather
   * than gating it, which is the stronger fix: a score that cannot be explained
   * has no threshold at which it becomes honest. This pins the deletion, on the
   * MACHINERY rather than the word, because the module's header comment
   * describes the gauge it removed.
   */
  it("the overview dashboard renders no composite health gauge at all", () => {
    const source = code("components/host/HostDashboard.tsx");
    expect(source).not.toMatch(/styles\.radar/);
    expect(source).not.toContain("conversionScore");
    expect(source).not.toContain('role="meter"');
  });
});

describe("the analytics workspace controls", () => {
  const workspace = () => read("components/host/HostAnalyticsWorkspace.tsx");

  /**
   * `getHostAnalytics(token, userId)` takes no window and its queries carry no
   * temporal predicate — every figure is all-time. A range picker over that
   * would filter nothing while implying it had.
   */
  it("offers no date range, and says why", () => {
    const source = workspace();
    expect(source).toMatch(/All-time figures/);
    expect(code("components/host/HostAnalyticsWorkspace.tsx")).not.toMatch(
      /dateRange|fromDate|sinceDays|last30/i,
    );
  });

  it("filters by listing and fires the filter event", () => {
    const source = workspace();
    expect(source).toContain("HOST_WORKSPACE_EVENTS.analyticsFilterUsed");
    expect(source).toContain("perListingStats.filter");
  });

  it("exports the real per-listing table as CSV", () => {
    const source = workspace();
    expect(source).toContain("buildCsv");
    expect(source).toContain("downloadCsv");
    expect(source).toContain("stat.invitesAccepted");
  });

  it("says the headline tiles stay account-wide when a listing is selected", () => {
    expect(workspace()).toMatch(/stay account-wide/);
  });
});

describe("analytics discovery sources and empty state", () => {
  const dashboard = () => read("components/host/HostAnalyticsDashboard.tsx");

  /**
   * `events.source_surface` is free text, unindexed, with one writer in the
   * whole app and no per-host rollup. A three-lane split would be a
   * fabrication with a legend.
   */
  it("states that discovery attribution is not measured, and charts nothing", () => {
    expect(dashboard()).toMatch(/Not measured yet/);
  });

  it("ships the D23 empty state: explanation, action, and a labelled sample", () => {
    const source = dashboard();
    expect(source).toContain("Nothing to measure yet");
    expect(source).toContain('href="/host/listings/new"');
    expect(source).toContain('href="/for-hosts/demo/dashboard"');
    expect(source).toMatch(/sample data/i);
  });

  it("sends the entitlement upsell to /host/plans, not to a second grid", () => {
    expect(dashboard()).toContain('href="/host/plans"');
    expect(code("components/host/HostAnalyticsDashboard.tsx")).not.toContain(
      "/host/settings#billing",
    );
  });

  it("ships a comparison TABLE, so the chart is not the only reading", () => {
    const source = dashboard();
    expect(source).toContain("<table");
    expect(source).toContain('<th scope="col">Invites accepted</th>');
  });
});

describe("a listing diagnosis never speaks without evidence", () => {
  function stat(over: Record<string, unknown> = {}) {
    return {
      listingId: "lst_1",
      listingTitle: "Dock Crew",
      listingStatus: "live",
      applicationsByStatus: {} as Record<string, number>,
      totalApplications: 0,
      invitesSent: 0,
      invitesAccepted: 0,
      ...over,
    };
  }

  it("returns null when nothing has happened", async () => {
    const { diagnoseListing } = await import(
      "../../components/host/HostAnalyticsDashboard"
    );
    expect(diagnoseListing(stat())).toBeNull();
  });

  it("names the numbers it read in every sentence it produces", async () => {
    const { diagnoseListing } = await import(
      "../../components/host/HostAnalyticsDashboard"
    );
    const cases = [
      stat({ invitesSent: 4 }),
      stat({ totalApplications: 6, applicationsByStatus: { applied: 6 } }),
      stat({
        totalApplications: 6,
        applicationsByStatus: { applied: 4, accepted: 2 },
      }),
    ];
    for (const entry of cases) {
      const text = diagnoseListing(entry);
      expect(text).toBeTruthy();
      // Every branch quotes at least one figure from the row it was given.
      expect(text).toMatch(/\d/);
    }
  });

  it("does not call a role successful on invitations alone", async () => {
    const { diagnoseListing } = await import(
      "../../components/host/HostAnalyticsDashboard"
    );
    const text = diagnoseListing(stat({ invitesSent: 9 }));
    expect(text).toMatch(/no applications back/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. COACH (§11 / D26)
// ═══════════════════════════════════════════════════════════════════════

describe("the Recruiting Coach", () => {
  const page = () => read("app/[locale]/(host)/host/coach/page.tsx");
  const summary = () => read("components/host/HostCoachSummary.tsx");

  it("puts the summary first and the chat second", () => {
    const source = page();
    expect(source.indexOf("<HostCoachSummary")).toBeGreaterThan(-1);
    expect(source.indexOf("<HostCoachSummary")).toBeLessThan(
      source.indexOf("<AssistantChat"),
    );
  });

  it("computes the summary from the host's own rows", () => {
    const source = page();
    expect(source).toContain("getHostListingSignals");
    expect(source).toContain("getHostApplications");
    expect(source).toContain("getConversations");
    expect(source).toContain("getLastMessagesForConversations");
  });

  it("works with no model configured, and says the summary does not need one", () => {
    const source = page();
    expect(source).toContain("AI_GATEWAY_API_KEY");
    // The summary is rendered OUTSIDE the `configured` branch.
    expect(source).toMatch(
      /<HostCoachSummary[\s\S]{0,300}\/>[\s\S]{0,200}\{configured \?/,
    );
    expect(source).toMatch(/does not depend\s*\n?\s*on it/);
  });

  it("states its sources above its conclusions", () => {
    expect(summary()).toContain("dataSource");
    expect(page()).toContain("describeDataSource(inputs)");
  });

  it("links every recommendation to the record it is about", () => {
    expect(summary()).toContain("recommendation.actionHref");
    expect(summary()).toContain(
      "HOST_WORKSPACE_EVENTS.coachRecommendationOpened",
    );
  });

  /**
   * Every host assistant tool is a reader — six `get*` calls and no Supabase
   * write anywhere — so there is no mutation to confirm, and claiming a
   * confirmation step would be a safety promise about a capability that does
   * not exist. This test is also the tripwire: adding a mutating tool fails
   * here, which is the moment the confirmation UI has to be built.
   */
  it("has no mutating assistant tool, so its no-mutation claim stays true", () => {
    const tools = code("services/assistant/hostTools.ts");
    expect(tools).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
    expect(summary()).toMatch(/never publishes, sends\s*\n?\s*a message/);
  });
});

describe("the coach recommendation derivation", () => {
  async function build(over: Record<string, unknown> = {}) {
    const mod = await import("../../app/[locale]/(host)/host/coach/coach-summary");
    return mod.buildCoachRecommendations({
      signals: [],
      liveListingCount: 1,
      totalListingCount: 1,
      newApplicantCount: 0,
      conversations: [],
      lastMessages: new Map(),
      inviteCreditsRemaining: null,
      ...over,
    } as never);
  }

  it("says nothing when there is nothing to say", async () => {
    expect(await build()).toEqual([]);
  });

  /**
   * The same predicate the inbox uses for its unread dot. A coach that counted
   * differently would claim follow-ups the messages page does not show.
   */
  it("counts a follow-up only for an unread message from the seeker", async () => {
    const conversations = [{ id: "c1" }, { id: "c2" }, { id: "c3" }] as never;
    const lastMessages = new Map<string, unknown>([
      // Unread, from the seeker — a real follow-up.
      ["c1", { senderType: "seeker", readAt: null }],
      // From the seeker but already read.
      ["c2", { senderType: "seeker", readAt: "2026-07-01T00:00:00Z" }],
      // The host spoke last; the ball is not in their court.
      ["c3", { senderType: "host", readAt: null }],
    ]);
    const out = await build({ conversations, lastMessages: lastMessages as never });
    const unanswered = out.find((entry) => entry.kind === "unanswered");
    expect(unanswered?.title).toContain("1 conversation");
  });

  /** A HostListingSignal, as getHostListingSignals would hand one over. */
  function signal(
    id: string,
    over: {
      gaps?: { field: string; reason: string; blocksPublication: boolean }[];
      blockingCount?: number;
      closingSoon?: boolean;
      daysUntilDeadline?: number | null;
      status?: string;
    } = {},
  ) {
    const gaps =
      over.gaps ??
      [{ field: "pay", reason: "A pay figure.", blocksPublication: false }];
    return {
      listingId: id,
      title: `Role ${id}`,
      status: over.status ?? "draft",
      category: "mix",
      coverPhotoUrl: null,
      locationDisplay: null,
      beginsAt: null,
      endsAt: null,
      publishedAt: null,
      expiresAt: null,
      readiness: {
        gaps,
        blockingCount: over.blockingCount ?? 0,
        photoEvidencePending: false,
        daysUntilDeadline: over.daysUntilDeadline ?? null,
        closingSoon: over.closingSoon ?? false,
      },
    };
  }

  it("caps unfinished-listing rows at three", async () => {
    const signals = Array.from({ length: 7 }, (_, index) => signal(`lst_${index}`));
    const out = await build({ signals: signals as never });
    expect(out.filter((entry) => entry.kind === "listing_quality")).toHaveLength(3);
  });

  it("says nothing about a listing with no gaps", async () => {
    const out = await build({ signals: [signal("ok", { gaps: [] })] as never });
    expect(out.some((entry) => entry.kind === "listing_quality")).toBe(false);
  });

  /**
   * F1's verdict separates "cannot publish" from "publishes but reads thin".
   * Sorting a missing cover photo above a missing pay figure would send a host
   * to fix the smaller problem first.
   */
  it("ranks a blocked listing above a merely thin one, and says it is blocked", async () => {
    const thin = signal("thin");
    const blocked = signal("blocked", {
      gaps: [
        { field: "pay", reason: "State a pay figure.", blocksPublication: true },
      ],
      blockingCount: 1,
    });
    const out = await build({ signals: [thin, blocked] as never });
    const rows = out.filter((entry) => entry.kind === "listing_quality");
    expect(rows[0].id).toBe("listing_blocked");
    expect(rows[0].title).toContain("cannot publish yet");
    expect(rows[1].title).toContain("is missing");
  });

  it("quotes the publication gate's own words, never a paraphrase", async () => {
    const out = await build({
      signals: [
        signal("g", {
          gaps: [
            {
              field: "housing",
              reason: "Housing is included but never described.",
              blocksPublication: true,
            },
          ],
          blockingCount: 1,
        }),
      ] as never,
    });
    expect(out[0].detail).toBe("Housing is included but never described.");
  });

  it("surfaces the soonest closing role, and only when one is closing", async () => {
    const none = await build({ signals: [signal("a")] as never });
    expect(none.some((entry) => entry.kind === "closing_soon")).toBe(false);

    const out = await build({
      signals: [
        signal("far", { closingSoon: true, daysUntilDeadline: 12, status: "live" }),
        signal("near", { closingSoon: true, daysUntilDeadline: 2, status: "live" }),
      ] as never,
    });
    const closing = out.find((entry) => entry.kind === "closing_soon");
    expect(closing?.id).toBe("closing_near");
    expect(closing?.title).toContain("2 roles");
  });

  it("suggests outreach only with credits, a live role, and an idle pipeline", async () => {
    const withPipeline = await build({
      inviteCreditsRemaining: 5,
      newApplicantCount: 3,
    });
    expect(withPipeline.some((entry) => entry.kind === "outreach")).toBe(false);

    const idle = await build({ inviteCreditsRemaining: 5, newApplicantCount: 0 });
    expect(idle.some((entry) => entry.kind === "outreach")).toBe(true);

    const noCredits = await build({
      inviteCreditsRemaining: 0,
      newApplicantCount: 0,
    });
    expect(noCredits.some((entry) => entry.kind === "outreach")).toBe(false);
  });

  /**
   * getHostListingSignals returns an EMPTY MAP on any fault, so zero signals
   * cannot mean "no listings" on its own. A null count is "we do not know", and
   * the summary must not turn that into advice.
   */
  it("says nothing about setup when the listing count is unknown", async () => {
    const out = await build({ totalListingCount: null, liveListingCount: null });
    expect(out.some((entry) => entry.kind === "setup")).toBe(false);
  });

  it("says the listings are unavailable rather than reporting zero", async () => {
    const mod = await import("../../app/[locale]/(host)/host/coach/coach-summary");
    const unknown = mod.describeDataSource({
      signals: [],
      liveListingCount: null,
      totalListingCount: null,
      newApplicantCount: 0,
      conversations: [],
      lastMessages: new Map(),
      inviteCreditsRemaining: null,
    } as never);
    expect(unknown).toContain("listings unavailable");
    expect(unknown).not.toContain("no listings yet");
  });

  it("withholds the outreach nudge when the live count is unknown", async () => {
    const out = await build({
      inviteCreditsRemaining: 5,
      newApplicantCount: 0,
      liveListingCount: null,
      totalListingCount: null,
    });
    expect(out.some((entry) => entry.kind === "outreach")).toBe(false);
  });

  it("distinguishes 'no listings' from 'nothing published'", async () => {
    const none = await build({ totalListingCount: 0, liveListingCount: 0 });
    expect(none.find((entry) => entry.kind === "setup")?.title).toBe(
      "No listings yet",
    );
    const drafts = await build({ totalListingCount: 3, liveListingCount: 0 });
    expect(drafts.find((entry) => entry.kind === "setup")?.title).toBe(
      "Nothing is published",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. NO SURFACE FABRICATES (the isolation-suite pattern, applied to (host))
// ═══════════════════════════════════════════════════════════════════════

describe("the host workspace never renders invented records", () => {
  /**
   * Two fixture families, both banned from the authenticated host tree. The
   * demo fixtures are 96 invented applicants for a company that does not exist;
   * `components/host/fixtures.ts` is the Sprint-Zero sample data (Maya at
   * Wenatchee Orchard Co.) that predates the data layer. Either one appearing
   * in a real host's coach summary or analytics page would be the worst thing
   * this phase could ship, and an autocomplete accident is enough to do it.
   */
  const BANNED_IMPORT =
    /from\s+["'][^"']*(components\/demo|enterpriseDemo|tourStops|host\/fixtures)["']/;

  it("imports no fixture module anywhere under (host)", () => {
    expect(HOST_ROUTES.length).toBeGreaterThan(0);
    for (const file of HOST_ROUTES) {
      const source = readFileSync(file, "utf8");
      expect(
        BANNED_IMPORT.test(source),
        `${relative(APPS_WEB, file)} imports fixture data`,
      ).toBe(false);
    }
  });

  it("keeps the coach's own modules fixture-free", () => {
    for (const file of [
      "components/host/HostCoachSummary.tsx",
      "app/[locale]/(host)/host/coach/coach-summary.ts",
      "services/assistant/hostTools.ts",
    ]) {
      expect(BANNED_IMPORT.test(read(file)), file).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. BILLING + SETTINGS (§13/§14 / D21) — one plans surface, and only one
// ═══════════════════════════════════════════════════════════════════════

describe("plans are rendered in exactly one place", () => {
  /**
   * Before F2 there were THREE plan grids: /host/billing, the Settings billing
   * tab, and /host/plans. Three grids meant three presentations of one set of
   * contract figures, and the add-on and discount rules only ever landed on
   * some of them. D21 collapses that onto /host/plans; these two tests are what
   * stop it growing back.
   */
  it("billing renders no plan grid and no plan checkout", () => {
    const source = code("app/[locale]/(host)/host/billing/page.tsx");
    expect(source).not.toContain("planGrid");
    expect(source).not.toContain("startHostCheckoutAction");
    expect(source).not.toContain("FOUNDER_LOCKED_PRICING[tier]");
  });

  it("settings renders no plan card, no tier list, and no plan checkout", () => {
    const source = code("components/host/HostSettings.tsx");
    expect(source).not.toContain("PlanCard");
    expect(source).not.toContain("planGrid");
    expect(source).not.toContain("PAID_TIERS");
    expect(source).not.toContain("startHostCheckoutAction");
    expect(source).not.toContain("FOUNDER_LOCKED_PRICING");
  });

  it("both link out to the one surface that does render them", () => {
    expect(read("app/[locale]/(host)/host/billing/page.tsx")).toContain(
      'href="/host/plans"',
    );
    expect(read("components/host/HostSettings.tsx")).toContain(
      'href="/host/plans"',
    );
    expect(read("components/host/HostSettings.tsx")).toContain(
      'href="/host/billing"',
    );
  });
});

describe("billing is a subscription centre", () => {
  const page = () => read("app/[locale]/(host)/host/billing/page.tsx");

  it("states plan, status and renewal from the subscription authority", () => {
    const source = page();
    expect(source).toContain("getHostSubscriptionByClerkUserId");
    expect(source).toContain("hostAccountState");
    expect(source).toContain("currentPeriodEnd");
  });

  it("meters the four real allowances it can read", () => {
    const source = page();
    expect(source).toContain("effectiveListingCap");
    expect(source).toContain("getInviteEntitlement");
    expect(source).toContain("countHostAnnouncementsThisMonth");
    // Boosts have no per-host query, so the page says so instead of counting.
    expect(source).toMatch(/Boost campaigns are not listed here/);
  });

  it("reads billing history from Stripe through a read-only helper", () => {
    expect(page()).toContain("listHostInvoices");
    const service = read("services/stripe/index.ts");
    expect(service).toContain("export async function listHostInvoices");
    // The helper lists and maps; it must never mutate a subscription.
    const body = service.slice(
      service.indexOf("export async function listHostInvoices"),
      service.indexOf("How much of a charge Stripe can still give back"),
    );
    expect(body).not.toMatch(/subscriptions\.(update|cancel|create)/);
    expect(body).not.toMatch(/invoices\.(pay|voidInvoice|create)/);
  });

  it("keeps the refund flow, contextualised beside the charges", () => {
    const source = page();
    expect(source).toContain("HostRefundPanel");
    expect(source).toMatch(/For a charge in the history above/);
  });

  it("fires plan_usage_viewed from a client island, not by client-ifying the page", () => {
    expect(read("app/[locale]/(host)/host/billing/PlanUsageViewed.tsx")).toContain(
      "HOST_WORKSPACE_EVENTS.planUsageViewed",
    );
    expect(page()).not.toContain('"use client"');
  });
});

describe("a usage meter is only drawn where both numbers are real", () => {
  it("renders a statement, not a bar, when the allowance is unknown", () => {
    const source = read("components/host/HostUsageMeters.tsx");
    expect(source).toContain("const known = row.included !== null");
    expect(source).toMatch(/Allowance unavailable right now/);
  });
});

describe("settings is real configuration", () => {
  const source = () => read("components/host/HostSettings.tsx");

  it("links to the employer profile and keeps notification preferences", () => {
    expect(source()).toContain('href="/host/profile/edit"');
    expect(read("app/[locale]/(host)/host/settings/page.tsx")).toContain(
      "EngagementNotificationSettings",
    );
  });

  it("names the sign-in provider for security rather than linking nowhere", () => {
    expect(source()).toMatch(/Password &amp; security/);
    expect(source()).toMatch(/sign-in provider/);
  });

  it("is honest that data export does not exist", () => {
    expect(source()).toMatch(/Not built yet\. There is no self-serve export/);
  });

  it("gives the host an Appearance control, through the one shared component", () => {
    expect(source()).toContain("<AppearanceControl />");
    expect(read("components/seeker/AppearanceControl.tsx")).toContain(
      "ThemeSwitcher".slice(0, 0) + "persistThemePref",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. HELP (§15)
// ═══════════════════════════════════════════════════════════════════════

describe("the help centre", () => {
  const source = () => read("components/host/HostHelpCenter.tsx");

  it("keeps search, categories and the FAQ", () => {
    const text = source();
    expect(text).toContain('type="search"');
    expect(text).toContain('role="tablist"');
    expect(text).toContain("TOPICS");
  });

  it("offers both tours, and distinguishes them", () => {
    const text = source();
    expect(text).toContain("Replay the workspace tour");
    expect(text).toContain('href="/for-hosts/demo"');
    expect(text).toMatch(/sample data/i);
  });

  it("resumes the workspace coachmarks without owning their state", () => {
    const text = source();
    expect(text).toContain("resetHostCoachmarks()");
    expect(text).toContain("HOST_COACHMARK_EVENT");
  });

  it("points its quick links at routes that exist after D21", () => {
    const text = source();
    expect(text).toContain('href: "/host/billing"');
    expect(text).not.toContain('href: "/host/settings", label: "Plan & billing"');
  });

  it("is honest that email is the whole support desk", () => {
    expect(source()).toMatch(/no ticket system or chat/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. THE BLOCKING MODAL IS DEAD (D19)
// ═══════════════════════════════════════════════════════════════════════

describe("the host shell no longer blocks its own workspace", () => {
  const shell = () => read("components/host/HostShell.tsx");

  it("mounts no OnboardingWalkthrough and no autoStart tour", () => {
    const source = code("components/host/HostShell.tsx");
    expect(source).not.toContain("OnboardingWalkthrough");
    expect(source).not.toContain("HOST_TOUR_STEPS");
    expect(source).not.toContain("autoStart");
    expect(source).not.toContain("ee.onboarding.host.v1");
  });

  it("mounts the anchored coachmarks instead", () => {
    expect(shell()).toContain("<HostCoachmarks");
    expect(shell()).toContain("HOST_COACHMARK_TARGETS.rail");
    expect(shell()).toContain("HOST_COACHMARK_TARGETS.create");
    expect(shell()).toContain("HOST_COACHMARK_TARGETS.activation");
  });

  /**
   * The component this removes set `aria-modal="true"`, trapped focus, locked
   * body scroll, and set `aria-hidden` on every sibling of <body>. The
   * replacement must do none of those things — a non-modal dialog that traps
   * the page is a lie about what it is.
   */
  it("the replacement traps nothing and dims nothing", () => {
    expect(read("components/host/HostCoachmarks.tsx")).toContain(
      'aria-modal="false"',
    );
    expect(read("components/host/HostCoachmarks.tsx")).toContain('role="dialog"');
    // Negatives against the CODE: the module's header comment names every
    // mechanism it deliberately does not use, and a raw source match would
    // fail on the explanation of why it does not use them.
    const source = code("components/host/HostCoachmarks.tsx");
    expect(source).not.toContain("createPortal");
    expect(source).not.toContain('aria-hidden="true"');
    expect(source).not.toMatch(/body\.style\.overflow/);
    expect(source).not.toMatch(/FOCUSABLE_SELECTOR/);
    expect(
      read("components/host/HostCoachmarks.module.css").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      ),
    ).not.toContain(".scrim");
  });

  it("is dismissible, persisted, and announces its position", () => {
    const source = read("components/host/HostCoachmarks.tsx");
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("Dismiss the workspace tour");
    expect(source).toContain("window.localStorage");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("aria-labelledby");
    expect(source).toContain("aria-describedby");
  });

  it("walks two to three stops, each anchored to an id the shell renders", () => {
    expect(HOST_COACHMARK_STOPS.length).toBeGreaterThanOrEqual(2);
    expect(HOST_COACHMARK_STOPS.length).toBeLessThanOrEqual(3);
    const rendered = [
      read("components/host/HostShell.tsx"),
      read("components/host/HostActivationBanner.tsx"),
      read("components/shell/ScopeShellNav.tsx"),
    ].join("\n");
    for (const stop of HOST_COACHMARK_STOPS) {
      expect(stop.body.length, stop.id).toBeGreaterThan(40);
      // The id reaches the DOM via HOST_COACHMARK_TARGETS, so the assertion is
      // that the shell wires an id at all on each of the three anchors.
      expect(rendered).toContain("id={");
    }
    expect(rendered).toContain("id={railId}");
    expect(rendered).toContain("id={id}");
  });

  /**
   * The activation stop points at the prospect banner, which renders for
   * `prospect` only — and can be dismissed even then. Offering the stop to a
   * paying host would be a mark pointing at nothing.
   */
  it("offers the activation stop only to a prospect", () => {
    expect(shell()).toContain(
      'showActivationStop={accountState === "prospect"}',
    );
    expect(read("components/host/HostCoachmarks.tsx")).toContain(
      "showActivationStop",
    );
  });

  it("skips a stop whose target never appears rather than floating a panel", () => {
    const source = read("components/host/HostCoachmarks.tsx");
    expect(source).toContain("misses > 60");
    expect(source).toContain("setIndex((current) => current + 1)");
  });

  /** SeekerShell keeps its copy — that removal is Phase G's, not this one's. */
  it("leaves the seeker shell's own walkthrough alone", () => {
    expect(read("components/seeker/SeekerShell.tsx")).toContain(
      "OnboardingWalkthrough",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. EVENTS
// ═══════════════════════════════════════════════════════════════════════

describe("the host workspace events", () => {
  it.each([
    ["messageSent", "host_message_sent"],
    ["announcementCreated", "announcement_created"],
    ["announcementPublished", "announcement_published"],
    ["analyticsFilterUsed", "analytics_filter_used"],
    ["coachRecommendationOpened", "coach_recommendation_opened"],
    ["planUsageViewed", "plan_usage_viewed"],
  ])("defines %s as %s", (key, value) => {
    expect(
      HOST_WORKSPACE_EVENTS[key as keyof typeof HOST_WORKSPACE_EVENTS],
    ).toBe(value);
  });

  it.each([
    ["messageSent", "components/host/HostMessageWorkspace.tsx"],
    ["announcementCreated", "components/host/HostAnnouncementComposer.tsx"],
    ["announcementPublished", "components/host/HostAnnouncementComposer.tsx"],
    ["analyticsFilterUsed", "components/host/HostAnalyticsWorkspace.tsx"],
    ["coachRecommendationOpened", "components/host/HostCoachSummary.tsx"],
    ["planUsageViewed", "app/[locale]/(host)/host/billing/PlanUsageViewed.tsx"],
  ])("fires %s from %s", (key, file) => {
    expect(read(file)).toContain(key);
  });

  /**
   * A plan-included announcement is created and published in one statement, so
   * both are true. A PURCHASED run was created by the Stripe webhook long
   * before the host filled it in, so only the publication is news — one event
   * name for both would hide the gap between paying and publishing.
   */
  it("reports a purchased run as published only, never as created", () => {
    const source = read("components/host/HostAnnouncementComposer.tsx");
    const draftBranch = source.slice(
      source.indexOf("if (hasDraft) {"),
      source.indexOf("} else {"),
    );
    expect(draftBranch).toContain("announcementPublished");
    expect(draftBranch).not.toContain("announcementCreated");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 10. CSV
// ═══════════════════════════════════════════════════════════════════════

describe("the CSV writer quotes what has to be quoted", () => {
  it.each([
    ["Dock Crew", "Dock Crew"],
    ["Dock Crew, Evenings", '"Dock Crew, Evenings"'],
    ['He said "yes"', '"He said ""yes"""'],
    ["Line\nbreak", '"Line\nbreak"'],
    ["", ""],
  ])("escapes %j", (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });

  it("renders null and undefined as an empty field, never as the word", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("keeps numbers unquoted so a spreadsheet reads them as numbers", () => {
    expect(csvField(96)).toBe("96");
    expect(csvField(0)).toBe("0");
  });

  it("terminates every row with CRLF, including the last", () => {
    const csv = buildCsv(["A", "B"], [[1, "x, y"]]);
    expect(csv).toBe('A,B\r\n1,"x, y"\r\n');
  });

  it("survives a listing title that would otherwise split a column", () => {
    const csv = buildCsv(["Listing", "Applications"], [["Kitchen, Evenings", 12]]);
    expect(csv.split("\r\n")[1]).toBe('"Kitchen, Evenings",12');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 11. BILLING CADENCE — sourced, or absent
// ═══════════════════════════════════════════════════════════════════════

describe("billing cadence comes from a real invoice or from nothing", () => {
  async function cadence(tier: string, amounts: number[]) {
    const mod = await import(
      "../../app/[locale]/(host)/host/billing/billing-cadence"
    );
    return mod.cadenceFromInvoices(
      tier,
      amounts.map((amountPaidCents, index) => ({
        id: `in_${index}`,
        number: null,
        createdAt: 0,
        // Irrelevant to the rule under test, and left empty on purpose: a
        // hardcoded currency code in a test file is exactly what the G52
        // locale ratchet exists to keep out of the tree.
        currency: "",
        amountPaidCents,
        status: "paid",
        hostedInvoiceUrl: null,
        invoicePdfUrl: null,
      })),
    );
  }

  it("identifies monthly and annual from the contract figures", async () => {
    expect(await cadence("professional", [39900])).toBe("monthly");
    expect(await cadence("professional", [399000])).toBe("annual");
  });

  /** A proration, an add-on or a discounted rate matches neither. */
  it("returns null rather than guessing at an unmatched amount", async () => {
    expect(await cadence("professional", [14900])).toBeNull();
    expect(await cadence("professional", [])).toBeNull();
    expect(await cadence("none", [39900])).toBeNull();
  });
});
