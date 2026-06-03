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
  tagline: "Family orchard hiring seasonal crews since 1998.",
  location: "Wenatchee, WA",
  bio: "We are a third-generation apple and pear orchard in the Wenatchee Valley. Each season we welcome a small crew for harvest, packing, and farm-stay work, with on-site housing and daily meals provided.",
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
    threadId: "thr_riley",
  },
  {
    id: "app_sam",
    applicantName: "Sam",
    listing: findListing("lst_orchard_wenatchee"),
    stage: "reviewing",
    appliedOn: "May 26, 2026",
    note: "Available through October; flexible on housing.",
    threadId: "thr_sam",
  },
  {
    id: "app_jordan",
    applicantName: "Jordan",
    listing: findListing("lst_vineyard_napa"),
    stage: "saved_by_host",
    appliedOn: "May 22, 2026",
    note: "Sommelier background with strong references.",
    threadId: "thr_jordan",
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
    messages: [
      {
        id: "msg_riley_1",
        from: "applicant",
        body: "Hi Maya, I just applied to the Orchard Harvest Crew listing.",
        sentOn: "Mon 9:40 AM",
      },
      {
        id: "msg_riley_2",
        from: "host",
        body: "Thanks Riley! Your harvest experience looks great. Could you start mid-month?",
        sentOn: "Mon 9:58 AM",
      },
      {
        id: "msg_riley_3",
        from: "applicant",
        body: "Thank you! I can start the week of the 18th.",
        sentOn: "10:02 AM",
      },
    ],
  },
  {
    id: "thr_sam",
    applicantName: "Sam",
    listingTitle: "Orchard Harvest Crew",
    preview: "Is on-site housing still available?",
    unread: true,
    updatedOn: "Yesterday",
    messages: [
      {
        id: "msg_sam_1",
        from: "host",
        body: "Hi Sam, thanks for applying to the Orchard Harvest Crew.",
        sentOn: "Yesterday 2:10 PM",
      },
      {
        id: "msg_sam_2",
        from: "applicant",
        body: "Happy to be considered. Is on-site housing still available?",
        sentOn: "Yesterday 2:25 PM",
      },
    ],
  },
  {
    id: "thr_jordan",
    applicantName: "Jordan",
    listingTitle: "Vineyard Tasting Host",
    preview: "Looking forward to the next steps.",
    unread: false,
    updatedOn: "May 30",
    messages: [
      {
        id: "msg_jordan_1",
        from: "host",
        body: "Hi Jordan, we have saved your application for the Vineyard Tasting Host role.",
        sentOn: "May 30 11:00 AM",
      },
      {
        id: "msg_jordan_2",
        from: "applicant",
        body: "Looking forward to the next steps.",
        sentOn: "May 30 11:20 AM",
      },
    ],
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

/** Look up a single applicant by id. */
export function findHostApplicant(id: string): HostApplicantItem | undefined {
  return HOST_APPLICANTS.find((applicant) => applicant.id === id);
}

/** Look up a single message thread by id. */
export function findHostThread(id: string): HostMessageThread | undefined {
  return HOST_THREADS.find((thread) => thread.id === id);
}
