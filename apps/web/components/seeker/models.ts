import type { DiscoveryListing } from "../discovery";

/**
 * Seeker lane — LOCAL lifecycle view models.
 *
 * The frozen @explore-and-earn/contracts package intentionally does NOT yet
 * expose persisted Application / Invite / Offer object models (those are
 * founder-gated and must arrive via a scoped contract build pack). So this lane
 * composes UI-only view-models on top of the Discovery lane's DiscoveryListing
 * (itself composed from the frozen contract registries). When the canonical
 * lifecycle contracts land, replace (or map from) these types. Nothing here is
 * added to @explore-and-earn/contracts.
 */

/**
 * Resume completion (0..100) required before an application can be submitted.
 * Per the Seeker Dashboard spec the apply action is gated until this threshold.
 */
export const RESUME_APPLY_THRESHOLD = 70;

export interface SeekerStatusSummary {
  readonly seekerName: string;
  /** Resume completion 0..100. Gates Apply when below RESUME_APPLY_THRESHOLD. */
  readonly resumeCompletion: number;
  readonly savedCount: number;
  readonly appliedCount: number;
  readonly offersCount: number;
  /** Title of the next confirmed/upcoming role, if any. */
  readonly acceptedUpcoming?: string;
  readonly unreadNotifications: number;
}

export type ApplicationStatus =
  | "applied"
  | "reviewing"
  | "offered"
  | "accepted"
  | "not_selected"
  | "withdrawn";

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "Applied",
  reviewing: "Reviewing",
  offered: "Offered",
  accepted: "Accepted",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};

export interface SavedItem {
  readonly listing: DiscoveryListing;
  /** Optional reason/hint, e.g. "Closing soon". */
  readonly note?: string;
}

export interface AppliedItem {
  readonly listing: DiscoveryListing;
  readonly status: ApplicationStatus;
  readonly appliedOn: string;
}

export type InviteState =
  | "new"
  | "viewed"
  | "expiring_soon"
  | "applied"
  | "expired";

export const INVITE_STATE_LABEL: Record<InviteState, string> = {
  new: "New invite",
  viewed: "Viewed",
  expiring_soon: "Expiring soon",
  applied: "Applied",
  expired: "Expired",
};

export interface InviteItem {
  readonly listing: DiscoveryListing;
  readonly state: InviteState;
  readonly expiresOn: string;
}

export type OfferState = "offered" | "accepted" | "declined" | "expired";

export const OFFER_STATE_LABEL: Record<OfferState, string> = {
  offered: "Offer received",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export interface OfferItem {
  readonly listing: DiscoveryListing;
  readonly state: OfferState;
  readonly expiresOn?: string;
  readonly messageFromHost?: string;
}

export type TravelPlanStatus = "not_started" | "shared";

export interface AcceptedRoleItem {
  readonly listing: DiscoveryListing;
  readonly startDate: string;
  readonly travelPlanStatus: TravelPlanStatus;
}

export interface NotSelectedItem {
  readonly listing: DiscoveryListing;
  readonly closedOn: string;
}

/** Inputs the Seeker Home priority resolver considers, highest priority first. */
export interface PrimaryActionInput {
  readonly status: SeekerStatusSummary;
  readonly pendingOffer?: OfferItem;
  readonly expiringInvite?: InviteItem;
  readonly upcomingRole?: AcceptedRoleItem;
  readonly strongMatch?: DiscoveryListing;
}

/** The single dominant next action chosen for Seeker Home. */
export type PrimaryAction =
  | { readonly kind: "offer"; readonly offer: OfferItem }
  | { readonly kind: "invite_expiring"; readonly invite: InviteItem }
  | { readonly kind: "accepted_upcoming"; readonly role: AcceptedRoleItem }
  | { readonly kind: "resume_incomplete"; readonly completion: number }
  | { readonly kind: "strong_match"; readonly listing: DiscoveryListing }
  | { readonly kind: "explore" };

/**
 * Seeker Home "Primary Next Action" priority logic (Seeker Dashboard spec):
 *   1. Offer pending
 *   2. Invite expiring
 *   3. Accepted role upcoming
 *   4. Resume incomplete
 *   5. Strong match
 *   else → explore
 *
 * Pure + deterministic so it is unit-testable without a backend. This is
 * presentation prioritization only — NOT a matching/scoring algorithm (match
 * isolation is enforced by guardrails; relevance is displayed via a neutral
 * Meter and never computed here).
 */
export function selectPrimaryAction(input: PrimaryActionInput): PrimaryAction {
  if (input.pendingOffer) {
    return { kind: "offer", offer: input.pendingOffer };
  }
  if (input.expiringInvite) {
    return { kind: "invite_expiring", invite: input.expiringInvite };
  }
  if (input.upcomingRole) {
    return { kind: "accepted_upcoming", role: input.upcomingRole };
  }
  if (input.status.resumeCompletion < RESUME_APPLY_THRESHOLD) {
    return { kind: "resume_incomplete", completion: input.status.resumeCompletion };
  }
  if (input.strongMatch) {
    return { kind: "strong_match", listing: input.strongMatch };
  }
  return { kind: "explore" };
}
