import { DISCOVERY_FIXTURES, type DiscoveryListing } from "../discovery";
import { countByStage } from "./models";
import type {
  HostApplicantItem,
  HostListingItem,
  HostListingState,
  HostMessageThread,
  HostProfileSummary,
} from "./models";

/**
 * Host fixtures — NO backend (Sprint Zero). Listing/applicant entries reuse the
 * Discovery lane's typed DiscoveryListing fixtures so the same canonical
 * listings flow through every lane. Replace with live data when the lifecycle
 * contracts + data layer land.
 *
 * Headline numbers are DERIVED (see HOST_LISTINGS + deriveHostStats), never
 * hardcoded, so the dashboard can't advertise a count that contradicts the
 * rows actually rendered.
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
};

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
    stage: "saved_by_host",
    appliedOn: "May 22, 2026",
    note: "Sommelier background with strong references.",
  },
];

/**
 * Listing lifecycle state per opportunity. Applicant counts are DERIVED from
 * HOST_APPLICANTS so a listing can never advertise a count that doesn't match
 * its real applicant rows.
 */
const HOST_LISTING_BASE: readonly {
  readonly listing: DiscoveryListing;
  readonly state: HostListingState;
}[] = [
  { listing: findListing("lst_orchard_wenatchee"), state: "open" },
  { listing: findListing("lst_vineyard_napa"), state: "partially_filled" },
  { listing: findListing("lst_deckhand_sitka"), state: "draft" },
];

export const HOST_LISTINGS: readonly HostListingItem[] = HOST_LISTING_BASE.map(
  (base) => {
    const applicants = HOST_APPLICANTS.filter(
      (applicant) => applicant.listing.id === base.listing.id,
    );
    return {
      ...base,
      applicantCount: applicants.length,
      newApplicantCount: countByStage(applicants).new,
    };
  },
);

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

/** Look up a single host listing view-model by its discovery listing id. */
export function findHostListing(id: string): HostListingItem | undefined {
  return HOST_LISTINGS.find((item) => item.listing.id === id);
}

/** All applicants who applied to a given listing. */
export function applicantsForListing(
  listingId: string,
): readonly HostApplicantItem[] {
  return HOST_APPLICANTS.filter(
    (applicant) => applicant.listing.id === listingId,
  );
}
