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
  readonly activeListings: number;
  readonly totalApplicants: number;
  readonly newApplicants: number;
  readonly unreadMessages: number;
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

export interface HostListingItem {
  readonly listing: DiscoveryListing;
  readonly state: HostListingState;
  readonly applicantCount: number;
  readonly newApplicantCount: number;
}

export type ApplicantStage =
  | "new"
  | "reviewing"
  | "shortlisted"
  | "offered"
  | "declined";

export const APPLICANT_STAGE_LABEL: Record<ApplicantStage, string> = {
  new: "New",
  reviewing: "Reviewing",
  shortlisted: "Shortlisted",
  offered: "Offered",
  declined: "Declined",
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
    shortlisted: 0,
    offered: 0,
    declined: 0,
  };
  for (const applicant of applicants) {
    counts[applicant.stage] += 1;
  }
  return counts;
}
