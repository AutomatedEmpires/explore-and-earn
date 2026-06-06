import type { DiscoveryListing } from "../discovery";
import {
  APPLIED_ITEMS,
  MATCHED_LISTINGS,
  PRIMARY_ACTION_INPUT,
  SAVED_ITEMS,
  SEEKER_STATUS,
} from "./fixtures";
import type {
  AcceptedRoleItem,
  AppliedItem,
  InviteItem,
  NotSelectedItem,
  OfferItem,
  PrimaryActionInput,
  SavedItem,
  SeekerStatusSummary,
} from "./models";

/**
 * Seeker lifecycle data-access boundary: the single fetch seam for the seeker's
 * own application state (status, saved, applied, invites, offers, accepted,
 * not-selected, and the Home priority inputs).
 *
 * Mirrors the Discovery lane's data.ts: every lifecycle surface reads through
 * these Promise-returning functions instead of importing the fixtures directly,
 * so swapping to the real persisted data layer is a localized change. The
 * status-bucket surfaces (/offered, /accepted, /not-selected) now read real
 * `applications` rows via getSeekerApplicationsWithListings in
 * @explore-and-earn/db, so the offer/accepted/not-selected/invite getters below
 * are deprecated (see each function).
 *
 * Arrays are returned as fresh copies so callers can never mutate the source.
 */

/** The seeker's at-a-glance status summary (counts, resume completion, etc.). */
export function getSeekerStatus(): Promise<SeekerStatusSummary> {
  return Promise.resolve(SEEKER_STATUS);
}

/** Saved opportunities the seeker wants to revisit. */
export function getSavedItems(): Promise<SavedItem[]> {
  return Promise.resolve([...SAVED_ITEMS]);
}

/** Applications the seeker has submitted. */
export function getAppliedItems(): Promise<AppliedItem[]> {
  return Promise.resolve([...APPLIED_ITEMS]);
}

/**
 * @deprecated Host invites live in the dedicated `invites` table, not in
 * fixtures or `applications`. The /invites page now renders an EmptyState
 * directly until that surface is wired. Retained (returns []) so any remaining
 * importers still compile.
 */
export function getInviteItems(): Promise<InviteItem[]> {
  return Promise.resolve([]);
}

/**
 * @deprecated Offers are now read from real `applications` rows (status
 * "offered") via getSeekerApplicationsWithListings in @explore-and-earn/db; the
 * /offered page calls that directly. Retained (returns []) for compatibility.
 */
export function getOfferItems(): Promise<OfferItem[]> {
  return Promise.resolve([]);
}

/**
 * @deprecated Accepted roles are now read from real `applications` rows (status
 * "accepted") via getSeekerApplicationsWithListings; the /accepted page calls
 * that directly. Retained (returns []) for compatibility.
 */
export function getAcceptedItems(): Promise<AcceptedRoleItem[]> {
  return Promise.resolve([]);
}

/**
 * @deprecated Not-selected applications are now read from real `applications`
 * rows (status "not_selected") via getSeekerApplicationsWithListings; the
 * /not-selected page calls that directly. Retained (returns []) for compat.
 */
export function getNotSelectedItems(): Promise<NotSelectedItem[]> {
  return Promise.resolve([]);
}

/** Matched-listing preview for Seeker Home (relevance via neutral Meter). */
export function getMatchedListings(): Promise<DiscoveryListing[]> {
  return Promise.resolve([...MATCHED_LISTINGS]);
}

/** Composed input for the Seeker Home primary-action resolver. */
export function getPrimaryActionInput(): Promise<PrimaryActionInput> {
  return Promise.resolve(PRIMARY_ACTION_INPUT);
}
