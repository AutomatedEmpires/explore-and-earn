import {
  APPLICATION_TRANSITIONS,
  canTransition,
  type ApplicationStatus,
  type MatchBand,
} from "@explore-and-earn/contracts";
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

export interface HostListingItem {
  readonly listing: DiscoveryListing;
  readonly state: HostListingState;
  readonly applicantCount: number;
  readonly newApplicantCount: number;
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
