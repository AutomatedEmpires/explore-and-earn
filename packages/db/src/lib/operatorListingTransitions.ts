import type { ListingStatus } from "@explore-and-earn/contracts";

/**
 * What an OPERATOR may do to a listing, as data.
 *
 * Separate from the host transition graph (queries/listingLifecycle.ts) on
 * purpose: these run through the service-role client, which migration 082's
 * trigger exempts by design — `enforce_listing_host_status_transition` returns
 * immediately for any request that is not `authenticated`. So the operator's
 * permitted moves are not written anywhere in the database, and before this
 * module they were three inline `.eq("status", "under_review")` filters.
 *
 * WHY THAT WAS BROKEN: since the founder's 2026-07-26 decision hosts publish
 * their own listings, so `under_review` is a state a listing passes THROUGH in
 * seconds. Filtering all three operator actions on it meant that by the time
 * anyone looked at a listing it was `live`, and approve / hold / close all
 * answered "Listing is no longer awaiting review." The only remaining way to
 * take a published listing down was takeModerationAction's archive path — a
 * different surface, a different verb, and an irreversible one.
 *
 * Moderation is REACTIVE now (082's own words). Reactive moderation that cannot
 * act on `live` is not moderation.
 *
 * `archived` and `closed` are deliberately NOT sources here: closed is already
 * down, and archived is terminal for hosts too. `paused` is not a source either
 * — a paused listing is invisible to seekers, so nothing needs taking down, and
 * an operator who wants it gone can still archive it through the moderation
 * path.
 */

/** The operator actions admin.ts exposes. */
export type OperatorListingAction = "approve" | "hold" | "close";

export interface OperatorListingTransition {
  /** The statuses the listing may be in for this action to apply. */
  readonly from: readonly ListingStatus[];
  /** The status it is moved to. */
  readonly to: ListingStatus;
  /**
   * What the operator is told when no row matched. Names both acceptable
   * sources, because "no longer awaiting review" was false for the case that
   * actually happens.
   */
  readonly noMatchMessage: string;
}

/**
 * The statuses an operator action can act from: a listing awaiting the last
 * step, or one already in front of seekers.
 */
export const OPERATOR_ACTIONABLE_STATUSES: readonly ListingStatus[] = [
  "under_review",
  "live",
];

const NO_MATCH =
  "That listing is not live or awaiting review, so there was nothing to change.";

export const OPERATOR_LISTING_TRANSITIONS: Record<
  OperatorListingAction,
  OperatorListingTransition
> = {
  // Publishing on the host's behalf. Accepting `live` keeps the action
  // idempotent rather than reporting a failure for work already done.
  approve: {
    from: OPERATOR_ACTIONABLE_STATUSES,
    to: "live",
    noMatchMessage: NO_MATCH,
  },
  // Unpublish for correction: the listing goes back to the host as a draft.
  // From `live` this is a real takedown that the host can undo by fixing and
  // republishing — the reversible half of reactive moderation.
  hold: {
    from: OPERATOR_ACTIONABLE_STATUSES,
    to: "draft",
    noMatchMessage: NO_MATCH,
  },
  // Takedown. 082 lets a host reopen a closed listing as a draft (unless it is
  // sourced), so this is a stop, not an erasure.
  close: {
    from: OPERATOR_ACTIONABLE_STATUSES,
    to: "closed",
    noMatchMessage: NO_MATCH,
  },
};

/** True when an operator action applies to a listing in `status`. */
export function operatorCanAct(
  action: OperatorListingAction,
  status: ListingStatus,
): boolean {
  return OPERATOR_LISTING_TRANSITIONS[action].from.includes(status);
}
