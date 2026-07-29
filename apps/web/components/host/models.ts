import {
  APPLICATION_TRANSITIONS,
  canTransition,
  type ApplicationStatus,
  type MatchBand,
  type MatchComponentScores,
} from "@explore-and-earn/contracts";
import type { ListingReadiness } from "@explore-and-earn/db";
import type { IconKey } from "@explore-and-earn/ui";

import type { DiscoveryListing } from "../discovery";

/**
 * Host lane — LOCAL view models.
 *
 * Mirrors the seeker lane's approach: the frozen @explore-and-earn/contracts
 * package intentionally does NOT yet expose persisted Listing / Application
 * object models (founder-gated; arriving via a scoped contract build pack,
 * tracked by the backend/matching issues). So the host lane composes UI-only
 * view-models on top of the Discovery lane's DiscoveryListing (itself composed
 * from the frozen contract registries). Nothing here is added to
 * @explore-and-earn/contracts, and no matching/scoring is computed here (match
 * isolation is enforced by guardrails).
 */

export interface HostProfileSummary {
  readonly hostName: string;
  readonly orgName: string;
  /** Short marketplace tagline shown on the public host profile. */
  readonly tagline?: string;
  /** Home base shown to seekers (city/region, presentation only). */
  readonly location?: string;
  /** Longer "about" blurb shown on the host profile. */
  readonly bio?: string;
  /** Subscription-gated verified host — automatic, not self-declared. Rendered via VerifiedHostBadge. */
  readonly verified: boolean;
  /** Host website URL. */
  readonly websiteUrl?: string;
  /** Instagram handle (without @). */
  readonly instagram?: string;
  /** X (Twitter) handle (without @). */
  readonly twitter?: string | null;
  /** Host-level "we generally provide housing" positioning. */
  readonly housingOfferedGenerally?: boolean;
  /** Host-level "we generally provide meals" positioning. */
  readonly mealsOfferedGenerally?: boolean;
  /** Marketplace categories this host operates in. */
  readonly categoryScopes?: readonly string[];
}

export type HostListingState =
  | "draft"
  | "open"
  | "partially_filled"
  | "filled"
  | "closed";

export const HOST_LISTING_STATE_LABEL: Record<HostListingState, string> = {
  draft: "Draft",
  open: "Open",
  partially_filled: "Partially filled",
  filled: "Filled",
  closed: "Closed",
};

/** Canonical Icon registry key per listing state (never a non-registry key). */
export const HOST_LISTING_STATE_ICON: Record<HostListingState, IconKey> = {
  draft: "system.info",
  open: "status.open",
  partially_filled: "status.partially_filled",
  filled: "status.filled",
  closed: "system.success",
};

/** Lifecycle states that count as a live, publicly listed opportunity. */
export const ACTIVE_HOST_LISTING_STATES: readonly HostListingState[] = [
  "open",
  "partially_filled",
  "filled",
];

/**
 * Full lifecycle order for listing management (filter chips, grouping).
 * Presentation only — ordering is a display concern, not a workflow engine.
 */
export const HOST_LISTING_STATE_ORDER: readonly HostListingState[] = [
  "draft",
  "open",
  "partially_filled",
  "filled",
  "closed",
];

/**
 * Map a persisted listings.status value to the host dashboard's lifecycle
 * state. The DB column (see supabase/migrations 006_listings.sql) allows
 * draft | under_review | live | paused | closed | archived; the host UI only
 * models draft / open / closed at this layer (partially_filled & filled are
 * derived from applicant data, which is not wired yet). Presentation only —
 * this selects a status label/icon and drives nothing. Unknown values fall
 * back to "draft", the safest non-public state.
 */
export function dbStatusToHostState(status: string): HostListingState {
  switch (status) {
    case "live":
      return "open";
    case "paused":
    case "closed":
    case "archived":
      return "closed";
    case "draft":
    case "under_review":
      return "draft";
    default:
      return "draft";
  }
}

/* ── The REAL lifecycle vocabulary ─────────────────────────────────────── */

/**
 * `listings.status` exactly as the database stores it (migration 006's CHECK).
 *
 * WHY THIS EXISTS ALONGSIDE HostListingState. `dbStatusToHostState` above folds
 * six stored values into five display states, and three of those folds lose
 * something a host manages by: `paused` and `archived` both become "closed", and
 * `under_review` becomes "draft". A listings surface whose tabs cannot tell a
 * paused listing from an archived one is not a management surface — so the
 * workspace filters, tabs, and status chips read THIS, and the lossy mapping is
 * left to the older surfaces that already depend on it.
 */
export const LISTING_LIFECYCLE_STATUSES = [
  "draft",
  "under_review",
  "live",
  "paused",
  "closed",
  "archived",
] as const;

export type ListingLifecycleStatus = (typeof LISTING_LIFECYCLE_STATUSES)[number];

export const LISTING_LIFECYCLE_LABEL: Record<ListingLifecycleStatus, string> = {
  draft: "Draft",
  under_review: "In review",
  live: "Live",
  paused: "Paused",
  closed: "Closed",
  archived: "Archived",
};

/** Canonical Icon registry key per stored status (never a non-registry key). */
export const LISTING_LIFECYCLE_ICON: Record<ListingLifecycleStatus, IconKey> = {
  draft: "action.edit",
  under_review: "system.info",
  live: "status.open",
  paused: "action.close",
  closed: "system.success",
  archived: "action.sort",
};

export function isListingLifecycleStatus(
  value: string,
): value is ListingLifecycleStatus {
  return (LISTING_LIFECYCLE_STATUSES as readonly string[]).includes(value);
}

export interface HostListingItem {
  readonly listing: DiscoveryListing;
  readonly state: HostListingState;
  readonly applicantCount: number;
  readonly newApplicantCount: number;
  /**
   * Health + deadline signals for this listing, from getHostListingSignals.
   * Optional because the surfaces that predate the workspace rebuild do not
   * load them, and a card without a health chip is better than a fabricated one.
   */
  readonly readiness?: ListingReadiness;
  /** `listings.expires_at` — the application deadline, when one is set. */
  readonly deadlineAt?: string | null;
}

/**
 * Tally by the STORED status, for the workspace tabs. Mirrors
 * countListingsByState but over the un-folded vocabulary, so a tab count can
 * never disagree with the rows it filters to.
 */
export function countListingsByStatus(
  listings: readonly HostListingItem[],
): Record<ListingLifecycleStatus, number> {
  const counts = Object.fromEntries(
    LISTING_LIFECYCLE_STATUSES.map((status) => [status, 0]),
  ) as Record<ListingLifecycleStatus, number>;
  for (const item of listings) {
    const status = item.listing.status;
    if (isListingLifecycleStatus(status)) counts[status] += 1;
  }
  return counts;
}

/** Live listings whose application deadline is inside the closing-soon window. */
export function countClosingSoon(listings: readonly HostListingItem[]): number {
  return listings.filter((item) => item.readiness?.closingSoon === true).length;
}

export type ApplicantStage =
  | "new"
  | "reviewing"
  | "saved_by_host"
  | "offered"
  | "accepted"
  | "declined";

export const APPLICANT_STAGE_LABEL: Record<ApplicantStage, string> = {
  new: "New",
  reviewing: "Reviewing",
  saved_by_host: "Saved",
  offered: "Offered",
  accepted: "Accepted",
  // The terminal-negative bucket holds not_selected AND seeker withdrawals AND
  // expiries — "Closed" is the honest umbrella ("Declined" claimed the host
  // declined every one of them).
  declined: "Closed",
};

/**
 * Canonical Icon registry key per applicant stage. Presentation only — these
 * label a stage badge and never drive any hiring decision (match/hiring
 * pipeline is founder-gated and out of scope here).
 */
export const APPLICANT_STAGE_ICON: Record<ApplicantStage, IconKey> = {
  new: "status.open",
  reviewing: "status.partially_filled",
  saved_by_host: "action.save",
  offered: "status.boosted",
  accepted: "status.accepted",
  declined: "action.close",
};

/**
 * Funnel order for the applicant pipeline (board columns, stage timelines).
 * Presentation only — ordering is a display concern, not a hiring workflow.
 */
export const APPLICANT_STAGE_ORDER: readonly ApplicantStage[] = [
  "new",
  "reviewing",
  "saved_by_host",
  "offered",
  "accepted",
  "declined",
];

export interface HostApplicantItem {
  readonly id: string;
  readonly applicantName: string;
  /** The listing they applied to (reused Discovery view-model). */
  readonly listing: DiscoveryListing;
  readonly stage: ApplicantStage;
  /**
   * The RAW applications.status (stage is a lossy display grouping — e.g.
   * accepted/active/completed all render as 'accepted'). Action legality is
   * computed from THIS via APPLICATION_TRANSITIONS, never from the stage.
   */
  readonly status: string;
  readonly appliedOn: string;
  /** Short note/snippet from the applicant. */
  readonly note?: string;
  /** Links this applicant to their message thread (HostMessageThread.id). */
  readonly threadId?: string;
  /** ADR-040 match score (0-100) for this applicant vs the listing, if computed. */
  readonly matchScore?: number;
  /** Match band for the score above (strong/developing/needs_attention). */
  readonly matchBand?: MatchBand;
  /**
   * The persisted per-component sub-scores behind that number.
   *
   * WHY THE CARD NEEDS THESE. A bare "84/100" beside a person's name is a
   * judgement with no argument — the host cannot tell whether it means the dates
   * line up or the pay does, and neither can we. G34 forbids storing the
   * sentence, so the components travel and `matchReasonPhrase` composes the
   * explanation at render time. Absent components mean no explanation is
   * rendered at all; none is ever guessed from the score.
   */
  readonly matchComponents?: MatchComponentScores;
  /** When the last message in this application's thread was sent. */
  readonly lastMessageAt?: string;
  /** Who sent it — so "waiting on you" is a fact, not an assumption. */
  readonly lastMessageFrom?: "seeker" | "host";
  /** The applicant re-applied after withdrawing (applications.reactivated_at). */
  readonly reapplied?: boolean;
}

/** A single message inside a host <-> applicant conversation (UI-only). */
export interface HostThreadMessage {
  readonly id: string;
  readonly from: "host" | "applicant";
  readonly body: string;
  readonly sentOn: string;
}

export interface HostMessageThread {
  readonly id: string;
  readonly applicantName: string;
  readonly listingTitle: string;
  readonly preview: string;
  readonly unread: boolean;
  readonly updatedOn: string;
  /** Full transcript for the thread-detail view (preview is the last entry). */
  readonly messages?: readonly HostThreadMessage[];
}

/**
 * A conversation as the message workspace needs it (V2 §9).
 *
 * Wider than HostMessageThread on purpose. The old list needed a name, a
 * subject line and a read flag; the workspace needs the JOINS, because the
 * product claim is that an answer stays attached to the person who asked. So
 * the summary carries the listing and application ids the `conversations` row
 * actually stores — nullable, because both foreign keys are `on delete set
 * null` and a conversation really can outlive the listing it started on.
 *
 * `updatedIso` is kept BESIDE the formatted label rather than instead of it:
 * sorting and "is this from today" are date questions, and re-parsing a
 * localised string to answer them is how a list ends up ordered by alphabet.
 */
export interface HostConversationSummary {
  readonly id: string;
  readonly applicantName: string;
  readonly listingTitle: string | null;
  readonly listingId: string | null;
  readonly applicationId: string | null;
  readonly preview: string;
  readonly unread: boolean;
  readonly updatedIso: string | null;
  readonly updatedLabel: string;
}

/**
 * Pure, deterministic pipeline tally for the host dashboard. Presentation only
 * — NOT a matching/scoring algorithm (match isolation is enforced by
 * guardrails). Unit-testable without a backend.
 */
/** A host card action: the button label + the DB status it would set. */
export interface ApplicantCardAction {
  readonly label: string;
  /** Button copy once the optimistic transition has applied. */
  readonly doneLabel: string;
  readonly variant: "secondary" | "ghost";
  readonly targetStage: ApplicantStage;
  readonly status: "reviewing" | "saved_by_host" | "offered" | "not_selected" | "accepted";
}

const ALL_CARD_ACTIONS: readonly ApplicantCardAction[] = [
  { label: "Skip", doneLabel: "Skipped", variant: "ghost", targetStage: "declined", status: "not_selected" },
  { label: "Save", doneLabel: "Saved", variant: "secondary", targetStage: "saved_by_host", status: "saved_by_host" },
  { label: "Offer", doneLabel: "Offered", variant: "secondary", targetStage: "offered", status: "offered" },
  { label: "Accept", doneLabel: "Accepted", variant: "secondary", targetStage: "accepted", status: "accepted" },
];

/**
 * The card actions that are LEGAL from the application's current DB status,
 * per the canonical APPLICATION_TRANSITIONS map. Buttons for illegal edges
 * are never rendered — previously every button rendered regardless of state
 * and invalid presses round-tripped to the server just to bounce off the
 * lifecycle trigger with a raw error code.
 */
export function legalCardActions(status: string): readonly ApplicantCardAction[] {
  return ALL_CARD_ACTIONS.filter((action) =>
    canTransition(
      APPLICATION_TRANSITIONS,
      status as ApplicationStatus,
      action.status as ApplicationStatus,
    ),
  );
}

export function countByStage(
  applicants: readonly HostApplicantItem[],
): Record<ApplicantStage, number> {
  const counts: Record<ApplicantStage, number> = {
    new: 0,
    reviewing: 0,
    saved_by_host: 0,
    offered: 0,
    accepted: 0,
    declined: 0,
  };
  for (const applicant of applicants) {
    counts[applicant.stage] += 1;
  }
  return counts;
}

/**
 * Pure, deterministic listing tally by lifecycle state, for the listings
 * management filter. Presentation only — mirrors countByStage. Unit-testable
 * without a backend.
 */
export function countListingsByState(
  listings: readonly HostListingItem[],
): Record<HostListingState, number> {
  const counts: Record<HostListingState, number> = {
    draft: 0,
    open: 0,
    partially_filled: 0,
    filled: 0,
    closed: 0,
  };
  for (const item of listings) {
    counts[item.state] += 1;
  }
  return counts;
}

/**
 * Dashboard / profile headline figures. DERIVED from the fixture arrays (never
 * hardcoded) so the numbers can never drift from the listings, applicants, and
 * threads actually rendered. Presentation only — no matching/scoring.
 */
export interface HostStats {
  readonly activeListings: number;
  readonly totalApplicants: number;
  readonly newApplicants: number;
  readonly unreadMessages: number;
}

export function deriveHostStats(
  listings: readonly HostListingItem[],
  applicants: readonly HostApplicantItem[],
  threads: readonly HostMessageThread[],
): HostStats {
  const stages = countByStage(applicants);
  return {
    activeListings: listings.filter((item) =>
      ACTIVE_HOST_LISTING_STATES.includes(item.state),
    ).length,
    totalApplicants: applicants.length,
    newApplicants: stages.new,
    unreadMessages: threads.filter((thread) => thread.unread).length,
  };
}
