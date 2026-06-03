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
  /** Self-declared verified host (G22). Rendered via VerifiedHostBadge. */
  readonly verified: boolean;
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
  | "declined";

export const APPLICANT_STAGE_LABEL: Record<ApplicantStage, string> = {
  new: "New",
  reviewing: "Reviewing",
  saved_by_host: "Saved",
  offered: "Offered",
  declined: "Declined",
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
  declined: "action.close",
};

export interface HostApplicantItem {
  readonly id: string;
  readonly applicantName: string;
  /** The listing they applied to (reused Discovery view-model). */
  readonly listing: DiscoveryListing;
  readonly stage: ApplicantStage;
  readonly appliedOn: string;
  /** Short note/snippet from the applicant. */
  readonly note?: string;
}

export interface HostMessageThread {
  readonly id: string;
  readonly applicantName: string;
  readonly listingTitle: string;
  readonly preview: string;
  readonly unread: boolean;
  readonly updatedOn: string;
}

/**
 * Pure, deterministic pipeline tally for the host dashboard. Presentation only
 * — NOT a matching/scoring algorithm (match isolation is enforced by
 * guardrails). Unit-testable without a backend.
 */
export function countByStage(
  applicants: readonly HostApplicantItem[],
): Record<ApplicantStage, number> {
  const counts: Record<ApplicantStage, number> = {
    new: 0,
    reviewing: 0,
    saved_by_host: 0,
    offered: 0,
    declined: 0,
  };
  for (const applicant of applicants) {
    counts[applicant.stage] += 1;
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
