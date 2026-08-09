import { DISCOVERY_FIXTURES, type DiscoveryListing } from "../discovery";
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
 * Seeker fixtures — NO backend (Sprint Zero). Lifecycle entries reuse the
 * Discovery lane's typed DiscoveryListing fixtures so the same canonical
 * listings flow through every seeker surface. Replace with live data when the
 * lifecycle contracts + data layer land.
 */
function findListing(id: string): DiscoveryListing {
  const found = DISCOVERY_FIXTURES.find((listing) => listing.id === id);
  if (!found) {
    throw new Error(`seeker fixtures: unknown discovery listing "${id}"`);
  }
  return found;
}

export const SEEKER_STATUS: SeekerStatusSummary = {
  seekerName: "Riley",
  resumeCompletion: 80,
  savedCount: 3,
  appliedCount: 2,
  offersCount: 1,
  acceptedCount: 1,
  acceptedUpcoming: "Ski Resort Front Desk",
  unreadNotifications: 4,
  invitesCount: 2,
};

export const SAVED_ITEMS: readonly SavedItem[] = [
  { listing: findListing("lst_remote_community"), note: "Strong match" },
  { listing: findListing("lst_eco_hostel_lisbon"), note: "Closing soon" },
  { listing: findListing("lst_vineyard_napa") },
];

export const APPLIED_ITEMS: readonly AppliedItem[] = [
  { listing: findListing("lst_orchard_wenatchee"), status: "reviewing", appliedOn: "May 24, 2026" },
  { listing: findListing("lst_remote_community"), status: "applied", appliedOn: "May 28, 2026" },
];

export const INVITE_ITEMS: readonly InviteItem[] = [
  { listing: findListing("lst_deckhand_sitka"), state: "expiring_soon", expiresOn: "Jun 6, 2026" },
  { listing: findListing("lst_eco_hostel_lisbon"), state: "new", expiresOn: "Jun 14, 2026" },
];

export const OFFER_ITEMS: readonly OfferItem[] = [
  {
    listing: findListing("lst_orchard_wenatchee"),
    state: "offered",
    expiresOn: "Jun 9, 2026",
    messageFromHost:
      "We loved your orchard experience — would you join us for the harvest?",
  },
];

/** Stable local-only identity shared by the accepted bucket and its detail route. */
export const DEV_ACCEPTED_APPLICATION_ID = "dev-application-ski-resort-accepted";
/** Production-shaped timestamps for the accepted walkthrough's listing window. */
export const DEV_ACCEPTED_BEGINS_AT = "2026-11-14T17:00:00.000Z";
export const DEV_ACCEPTED_ENDS_AT = "2027-04-18T17:00:00.000Z";

const ACCEPTED_LISTING = findListing("lst_ski_resort_breck");

export const ACCEPTED_ITEMS: readonly AcceptedRoleItem[] = [
  {
    listing: ACCEPTED_LISTING,
    startDate: ACCEPTED_LISTING.begins ?? ACCEPTED_LISTING.opportunityWindow,
    travelPlanStatus: "not_started",
  },
];

export const NOT_SELECTED_ITEMS: readonly NotSelectedItem[] = [
  { listing: findListing("lst_vineyard_napa"), closedOn: "May 20, 2026" },
];

/** Matched listings preview for Seeker Home (relevance shown via neutral Meter). */
export const MATCHED_LISTINGS: readonly DiscoveryListing[] = DISCOVERY_FIXTURES.filter(
  (listing) => typeof listing.matchScore === "number",
);

/** Composed input for the Seeker Home primary-action resolver. */
export const PRIMARY_ACTION_INPUT: PrimaryActionInput = {
  status: SEEKER_STATUS,
  pendingOffer: OFFER_ITEMS[0],
  expiringInvite: INVITE_ITEMS[0],
  upcomingRole: ACCEPTED_ITEMS[0],
  strongMatch: MATCHED_LISTINGS[0],
};
