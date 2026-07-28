import type {
  HostAnalytics,
  HostHiringPulse,
  HostListingSignal,
} from "@explore-and-earn/db";

/**
 * The host workspace's derivations, as pure functions.
 *
 * WHY PURE, AND WHY HERE. Every number on the overview is an assertion about a
 * host's season, and the previous dashboard made three of them up: a "conversion
 * radar" percentage averaged from a hand-picked trio, an "inventory" score that
 * awarded 40 points for owning a draft, and a KPI strip whose trend slot held the
 * literal string "All-time". None of that was testable, because it was computed
 * inline in JSX. So the arithmetic lives here, where a test can hold it to the
 * records it claims to summarise, and the component only renders the result.
 *
 * NOTHING IN THIS FILE INVENTS A SOURCE. Each function takes only values that
 * came out of the database and says, in its own doc, which ones.
 */

/* ── Identity band ───────────────────────────────────────────────────────── */

/**
 * Which parts of a host's public identity are filled in.
 *
 * A COUNT OF REAL FIELDS, NOT A SCORE. `host_profiles.completion_score` exists
 * in the schema and is written by nothing, so a percentage from it would be a
 * number with no author. This counts fields the host can see on their own public
 * page and names the missing ones, so "3 of 6" is a sentence they can act on
 * rather than a grade.
 */
export interface HostProfileCompleteness {
  readonly filled: number;
  readonly total: number;
  /** Human labels for what is still blank, in the order a host meets them. */
  readonly missing: readonly string[];
  readonly complete: boolean;
}

export interface HostProfileFields {
  readonly companyName?: string | null;
  readonly hostName?: string | null;
  readonly tagline?: string | null;
  readonly about?: string | null;
  readonly primaryLocationName?: string | null;
  readonly photoUrl?: string | null;
}

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function hostProfileCompleteness(
  profile: HostProfileFields | null,
): HostProfileCompleteness {
  const checks: readonly { readonly label: string; readonly ok: boolean }[] = [
    { label: "Company name", ok: filled(profile?.companyName) },
    { label: "Your name", ok: filled(profile?.hostName) },
    { label: "Tagline", ok: filled(profile?.tagline) },
    { label: "About your operation", ok: filled(profile?.about) },
    { label: "Home base", ok: filled(profile?.primaryLocationName) },
    { label: "Cover photo", ok: filled(profile?.photoUrl) },
  ];
  const missing = checks.filter((check) => !check.ok).map((check) => check.label);
  return {
    filled: checks.length - missing.length,
    total: checks.length,
    missing,
    complete: missing.length === 0,
  };
}

/* ── Pipeline funnel ─────────────────────────────────────────────────────── */

/**
 * The applicant funnel, from the host's REAL all-time counts by stored status.
 *
 * The stored vocabulary has ten values and the funnel has five steps, so the
 * folds are declared here rather than inline: `saved_by_host` sits with
 * shortlisting, and `active`/`completed` are engagements that already passed
 * through `accepted`. Terminal-negative statuses are counted separately and are
 * NOT a funnel step — a rejected candidate did not reach a later stage, and
 * putting them in the bar chart would make the funnel stop summing to itself.
 */
export interface FunnelStep {
  readonly id: "applied" | "reviewing" | "shortlisted" | "offered" | "accepted";
  readonly label: string;
  readonly count: number;
}

export interface PipelineFunnel {
  readonly steps: readonly FunnelStep[];
  /** Every application ever received, including closed ones. */
  readonly total: number;
  /** not_selected + withdrawn + expired. Real, and deliberately outside the steps. */
  readonly closed: number;
  /** Applications that moved beyond the first look, as a whole percent of total. */
  readonly advancedPercent: number;
}

export function pipelineFunnel(
  byStatus: Readonly<Record<string, number>>,
): PipelineFunnel {
  const at = (status: string): number => byStatus[status] ?? 0;

  const applied = at("applied");
  const reviewing = at("reviewing");
  const shortlisted = at("saved_by_host");
  const offered = at("offered");
  const accepted = at("accepted") + at("active") + at("completed");
  const closed = at("not_selected") + at("withdrawn") + at("expired");

  const total = applied + reviewing + shortlisted + offered + accepted + closed;
  const advanced = total - applied;

  return {
    steps: [
      { id: "applied", label: "Applied", count: applied },
      { id: "reviewing", label: "Reviewing", count: reviewing },
      { id: "shortlisted", label: "Shortlisted", count: shortlisted },
      { id: "offered", label: "Offered", count: offered },
      { id: "accepted", label: "Accepted", count: accepted },
    ],
    total,
    closed,
    advancedPercent: total > 0 ? Math.round((advanced / total) * 100) : 0,
  };
}

/* ── Needs attention ─────────────────────────────────────────────────────── */

/**
 * One thing this host should do, with the record that says so.
 *
 * `evidence` is not decoration. The previous dashboard rendered "Respond quickly
 * to win great seekers" under a count — advice, attached to nothing. D24 asks for
 * evidence-linked diagnoses only, so every item here names the records it was
 * counted from and every item links to the surface that resolves it.
 */
export type AttentionTone = "urgent" | "soon" | "later";

export interface AttentionItem {
  readonly id: string;
  readonly title: string;
  readonly evidence: string;
  readonly href: string;
  readonly tone: AttentionTone;
  /** Rendered as the leading numeral when the item counts something. */
  readonly count?: number;
}

export interface AttentionInputs {
  /** applications.status === 'applied' — nobody has looked at these yet. */
  readonly newApplicants: number;
  /** applications.status === 'offered' — the host is waiting on the seeker. */
  readonly offersOutstanding: number;
  /** Unread seeker messages (messages.read_at is null). */
  readonly unreadMessages: number;
  /** Every listing the host owns, with its readiness verdict. */
  readonly listings: readonly HostListingSignal[];
  /** hostAccountState(): 'prospect' | 'lapsed' | 'active' | 'cancelled' | null. */
  readonly accountState: string | null;
  /** How much of the public profile is filled in. */
  readonly profile: HostProfileCompleteness;
}

const PLURAL = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The single prioritised queue. This REPLACES both the old "Getting started"
 * checklist and the old "What to do next" panel, which rendered stacked on the
 * same screen and disagreed: the checklist could read 0/3 while the panel above
 * it said "You're all caught up."
 *
 * Setup steps are ordinary items here, not a separate widget — a host with no
 * profile and a host with nine unread messages both want one list of what to do,
 * ordered by what it costs to ignore.
 */
export function needsAttention(inputs: AttentionInputs): readonly AttentionItem[] {
  const items: AttentionItem[] = [];

  // Money first: a lapsed plan silently unpublishes a season.
  if (inputs.accountState === "lapsed") {
    items.push({
      id: "billing",
      title: "Your plan payment did not go through",
      evidence: "Your subscription is past due — listings stop being discoverable while it is.",
      href: "/host/billing",
      tone: "urgent",
    });
  }

  const blocked = inputs.listings.filter(
    (listing) =>
      listing.readiness.blockingCount > 0 &&
      (listing.status === "draft" || listing.status === "under_review"),
  );
  const closingSoon = inputs.listings.filter((listing) => listing.readiness.closingSoon);

  if (inputs.newApplicants > 0) {
    items.push({
      id: "new-applicants",
      title: `${inputs.newApplicants} ${PLURAL(inputs.newApplicants, "applicant", "applicants")} nobody has opened`,
      evidence: `Still at the "applied" stage across your listings.`,
      href: "/host/applicants",
      tone: "urgent",
      count: inputs.newApplicants,
    });
  }

  if (inputs.unreadMessages > 0) {
    items.push({
      id: "unread",
      title: `${inputs.unreadMessages} unread ${PLURAL(inputs.unreadMessages, "message", "messages")}`,
      evidence: "Seekers have written and have not had a reply.",
      href: "/host/messages",
      tone: "urgent",
      count: inputs.unreadMessages,
    });
  }

  for (const listing of closingSoon) {
    const days = listing.readiness.daysUntilDeadline ?? 0;
    items.push({
      id: `closing-${listing.listingId}`,
      title: `${listing.title} closes in ${days} ${PLURAL(days, "day", "days")}`,
      evidence: "Its application deadline is inside two weeks.",
      href: `/host/listings/${listing.listingId}`,
      tone: days <= 3 ? "urgent" : "soon",
    });
  }

  if (inputs.offersOutstanding > 0) {
    items.push({
      id: "offers",
      title: `${inputs.offersOutstanding} ${PLURAL(inputs.offersOutstanding, "offer is", "offers are")} waiting on a reply`,
      evidence: `Applications sitting at the "offered" stage.`,
      href: "/host/applicants",
      tone: "soon",
      count: inputs.offersOutstanding,
    });
  }

  for (const listing of blocked) {
    const count = listing.readiness.blockingCount;
    items.push({
      id: `gaps-${listing.listingId}`,
      title: `${listing.title} cannot be published yet`,
      evidence: `${count} required ${PLURAL(count, "field is", "fields are")} unanswered: ${listing.readiness.gaps
        .filter((gap) => gap.blocksPublication)
        .map((gap) => gap.field)
        .join(", ")}.`,
      href: `/host/listings/${listing.listingId}/edit`,
      tone: "soon",
    });
  }

  // Setup steps, folded in rather than stacked above as a second widget.
  if (inputs.listings.length === 0) {
    items.push({
      id: "first-listing",
      title: "Post your first opportunity",
      evidence: "You have no listings yet, so there is nothing for seekers to find.",
      href: "/host/listings/new",
      tone: "soon",
    });
  }

  if (!inputs.profile.complete) {
    items.push({
      id: "profile",
      title: "Finish your employer profile",
      evidence: `${inputs.profile.filled} of ${inputs.profile.total} filled in — still blank: ${inputs.profile.missing.join(", ")}.`,
      href: "/host/profile/edit",
      tone: "later",
    });
  }

  return items;
}

/* ── Opportunity performance ─────────────────────────────────────────────── */

/**
 * A live listing with the numbers the host is entitled to see about it.
 *
 * `perListing` is EMPTY on the basic analytics scope — that is the paid
 * distinction (ADR-039), applied inside getHostAnalytics, not here. So invite
 * figures are optional and the card simply omits them rather than showing zero,
 * which would tell a Starter host their invites never landed.
 */
export interface OpportunityPerformance {
  readonly signal: HostListingSignal;
  readonly applications: number;
  readonly newApplications: number;
  readonly invitesSent: number | null;
  readonly invitesAccepted: number | null;
}

export function opportunityPerformance(
  signals: readonly HostListingSignal[],
  analytics: HostAnalytics,
  applicationCounts: Readonly<Record<string, number>>,
  newApplicationCounts: Readonly<Record<string, number>>,
): readonly OpportunityPerformance[] {
  const perListing = new Map(
    analytics.perListingStats.map((stat) => [stat.listingId, stat]),
  );
  return signals
    .filter((signal) => signal.status === "live" || signal.status === "paused")
    .map((signal) => {
      const stat = perListing.get(signal.listingId);
      return {
        signal,
        applications: applicationCounts[signal.listingId] ?? 0,
        newApplications: newApplicationCounts[signal.listingId] ?? 0,
        invitesSent: stat ? stat.invitesSent : null,
        invitesAccepted: stat ? stat.invitesAccepted : null,
      };
    })
    .sort((a, b) => b.applications - a.applications);
}

/* ── Upcoming ────────────────────────────────────────────────────────────── */

/**
 * Dated things ahead, from listing rows only.
 *
 * NO SCHEDULED ANNOUNCEMENTS. `host_announcements` has no publish_at,
 * scheduled_at or 'scheduled' status — its `expires_at` is an END time and its
 * 'draft' status means a Stripe webhook created the row before the host wrote
 * anything. There is no such thing as a scheduled announcement to list, so this
 * lists none.
 */
export interface UpcomingEntry {
  readonly id: string;
  readonly at: string;
  readonly title: string;
  readonly detail: string;
  readonly tone: AttentionTone;
  readonly href: string;
}

export function upcomingEntries(
  signals: readonly HostListingSignal[],
  nowMs: number = Date.now(),
  limit = 6,
): readonly UpcomingEntry[] {
  const entries: UpcomingEntry[] = [];
  for (const signal of signals) {
    if (signal.status !== "live" && signal.status !== "paused") continue;
    const deadlineDays = signal.readiness.daysUntilDeadline;
    if (signal.expiresAt && deadlineDays !== null) {
      entries.push({
        id: `deadline-${signal.listingId}`,
        at: signal.expiresAt,
        title: `${signal.title} — applications close`,
        detail: `${deadlineDays} ${PLURAL(deadlineDays, "day", "days")} away`,
        tone: deadlineDays <= 7 ? "urgent" : deadlineDays <= 21 ? "soon" : "later",
        href: `/host/listings/${signal.listingId}`,
      });
    }
    if (signal.beginsAt && new Date(signal.beginsAt).getTime() > nowMs) {
      entries.push({
        id: `begins-${signal.listingId}`,
        at: signal.beginsAt,
        title: `${signal.title} — season starts`,
        detail: "Crew should be hired and travelling by now",
        tone: "soon",
        href: `/host/listings/${signal.listingId}`,
      });
    }
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit);
}

/* ── KPI strip ───────────────────────────────────────────────────────────── */

/** One tile of the hiring pulse, already turned into copy. */
export interface PulseTile {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  /** Null when the previous window was empty — see PulseDelta.changePercent. */
  readonly trend: string | null;
  readonly trendTone: "up" | "down" | "neutral";
  readonly href: string;
}

export function pulseTiles(pulse: HostHiringPulse): readonly PulseTile[] {
  const tile = (
    id: string,
    label: string,
    delta: HostHiringPulse["applicationsReceived"],
    href: string,
  ): PulseTile => ({
    id,
    label,
    value: delta.current,
    // "no change" is a real answer; "+100%" from zero is not, so a null percent
    // becomes a plain count of the prior window instead of a fabricated ratio.
    trend:
      delta.changePercent === null
        ? delta.previous === 0 && delta.current === 0
          ? null
          : `vs ${delta.previous} before`
        : `${delta.change >= 0 ? "+" : ""}${delta.changePercent}% vs previous`,
    trendTone:
      delta.direction === "up" ? "up" : delta.direction === "down" ? "down" : "neutral",
    href,
  });

  return [
    tile("applications", "Applications", pulse.applicationsReceived, "/host/applicants"),
    tile("invites", "Invites sent", pulse.invitesSent, "/host/outreach"),
    tile("accepted", "Invites taken up", pulse.invitesAccepted, "/host/outreach"),
    tile("published", "Listings published", pulse.listingsPublished, "/host/listings"),
  ];
}
