import type { DiscoveryListing } from "../discovery";
import {
  ACCEPTED_ITEMS,
  APPLIED_ITEMS,
  INVITE_ITEMS,
  MATCHED_LISTINGS,
  NOT_SELECTED_ITEMS,
  OFFER_ITEMS,
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
 * Seeker lifecycle data-access boundary \u2014 the single fetch seam for the
 * seeker's own application state (status, saved, applied, invites, offers,
 * accepted, not-selected, and the Home priority inputs).
 *
 * Mirrors the Discovery lane's data.ts: every lifecycle surface reads through
 * these Promise-returning functions instead of importing the fixtures
 * directly, so swapping to the real persisted Application / Invite / Offer data
 * layer (founder-gated Database V1) is a single-file change HERE \u2014 no page,
 * component, or view-model rewrite. The exported function shapes are the
 * contract the UI depends on and must stay stable.
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

/** Host invitations to apply. */
export function getInviteItems(): Promise<InviteItem[]> {
  return Promise.resolve([...INVITE_ITEMS]);
}

/** Offers extended to the seeker by hosts. */
export function getOfferItems(): Promise<OfferItem[]> {
  return Promise.resolve([...OFFER_ITEMS]);
}

/** Confirmed roles the seeker has accepted. */
export function getAcceptedItems(): Promise<AcceptedRoleItem[]> {
  return Promise.resolve([...ACCEPTED_ITEMS]);
}

/** Applications that closed without selection. */
export function getNotSelectedItems(): Promise<NotSelectedItem[]> {
  return Promise.resolve([...NOT_SELECTED_ITEMS]);
}

/** Matched-listing preview for Seeker Home (relevance via neutral Meter). */
export function getMatchedListings(): Promise<DiscoveryListing[]> {
  return Promise.resolve([...MATCHED_LISTINGS]);
}

/** Composed input for the Seeker Home primary-action resolver. */
export function getPrimaryActionInput(): Promise<PrimaryActionInput> {
  return Promise.resolve(PRIMARY_ACTION_INPUT);
}
