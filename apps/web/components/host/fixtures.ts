import { DISCOVERY_FIXTURES, type DiscoveryListing } from "../discovery";
import type {
  HostApplicantItem,
  HostListingItem,
  HostMessageThread,
  HostProfileSummary,
} from "./models";

/**
 * Host fixtures — NO backend (Sprint Zero). Listing/applicant entries reuse the
 * Discovery lane's typed DiscoveryListing fixtures so the same canonical
 * listings flow through every lane. Replace with live data when the lifecycle
 * contracts + data layer land.
 */
function findListing(id: string): DiscoveryListing {
  const found = DISCOVERY_FIXTURES.find((listing) => listing.id === id);
  if (!found) {
    throw new Error(`host fixtures: unknown discovery listing "${id}"`);
  }
  return found;
}

export const HOST_PROFILE: HostProfileSummary = {
  hostName: "Maya",
  orgName: "Wenatchee Orchard Co.",
  verified: true,
  activeListings: 3,
  totalApplicants: 14,
  newApplicants: 4,
  unreadMessages: 2,
};

export const HOST_LISTINGS: readonly HostListingItem[] = [
  {
    listing: findListing("lst_orchard_wenatchee"),
    state: "open",
    applicantCount: 7,
    newApplicantCount: 3,
  },
  {
    listing: findListing("lst_vineyard_napa"),
    state: "partially_filled",
    applicantCount: 5,
    newApplicantCount: 1,
  },
  {
    listing: findListing("lst_deckhand_sitka"),
    state: "draft",
    applicantCount: 0,
    newApplicantCount: 0,
  },
];

export const HOST_APPLICANTS: readonly HostApplicantItem[] = [
  {
    id: "app_riley",
    applicantName: "Riley",
    listing: findListing("lst_orchard_wenatchee"),
    stage: "new",
    appliedOn: "May 28, 2026",
    note: "Five seasons of orchard and harvest experience.",
  },
  {
    id: "app_sam",
    applicantName: "Sam",
    listing: findListing("lst_orchard_wenatchee"),
    stage: "reviewing",
    appliedOn: "May 26, 2026",
    note: "Available through October; flexible on housing.",
  },
  {
    id: "app_jordan",
    applicantName: "Jordan",
    listing: findListing("lst_vineyard_napa"),
    stage: "shortlisted",
    appliedOn: "May 22, 2026",
    note: "Sommelier background with strong references.",
  },
];

export const HOST_THREADS: readonly HostMessageThread[] = [
  {
    id: "thr_riley",
    applicantName: "Riley",
    listingTitle: "Orchard Harvest Crew",
    preview: "Thank you! I can start the week of the 18th.",
    unread: true,
    updatedOn: "10:02 AM",
  },
  {
    id: "thr_sam",
    applicantName: "Sam",
    listingTitle: "Orchard Harvest Crew",
    preview: "Is on-site housing still available?",
    unread: true,
    updatedOn: "Yesterday",
  },
  {
    id: "thr_jordan",
    applicantName: "Jordan",
    listingTitle: "Vineyard Tasting Host",
    preview: "Looking forward to the next steps.",
    unread: false,
    updatedOn: "May 30",
  },
];
