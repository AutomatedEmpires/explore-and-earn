import type { HostInvite, SeekerSearchResult } from "@explore-and-earn/db/client";

import type {
  InviteEntitlementVM,
  SourcingBucketVM,
} from "../../components/host/MatchedSeekerSourcing";
import type { OutreachSearchPreviewVM } from "../../components/host/SeekerSearchDrawer";
import { OUTREACH_PREVIEW_NOTICE } from "../hostOutreach";

export interface DevOutreachListing {
  readonly id: string;
  readonly title: string;
}

export interface DevHostOutreachFixture {
  readonly listings: readonly DevOutreachListing[];
  readonly invites: readonly HostInvite[];
  readonly entitlement: InviteEntitlementVM;
  readonly buckets: readonly SourcingBucketVM[];
  readonly searchPreview: OutreachSearchPreviewVM;
}

const ORCHARD_LISTING_ID = "11111111-1111-4111-8111-111111111111";
const VINEYARD_LISTING_ID = "22222222-2222-4222-8222-222222222222";
const REMOTE_LISTING_ID = "33333333-3333-4333-8333-333333333333";
const ORCHARD_LISTING_TITLE =
  "OrchardHarvestCrewWithAnExtremelyLongUnbrokenListingIdentifierForContainment";
const CONTAINMENT_SEEKER_NAME =
  "ContainmentSpecialistWithAnExtremelyLongUnbrokenDisplayNameForPhoneLayouts";

const AVERY = {
  seekerProfileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  displayName: "Avery Nguyen",
  shortBio:
    "Harvest crew lead with orchard safety training and guest-facing experience.",
  photoUrl: null,
  generalSkills: [
    "Harvest operations",
    "Crew leadership",
    "CrossFunctionalHarvestOperationsSafetyComplianceDocumentation",
  ],
  desiredCategories: ["farm", "seasonal"],
  score: 91,
  band: "strong",
  alreadyInvited: false,
} as const;

const JORDAN = {
  seekerProfileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  displayName: "Jordan Lee",
  shortBio: "Seasonal hospitality worker with tasting-room and farm-stand experience.",
  photoUrl: null,
  generalSkills: ["Hospitality", "Point of sale", "Food safety"],
  desiredCategories: ["seasonal", "farm"],
  score: 78,
  band: "strong",
  alreadyInvited: true,
} as const;

const SEARCH_SEEKERS = [
  {
    seekerProfileId: AVERY.seekerProfileId,
    displayName: AVERY.displayName,
    bio: AVERY.shortBio,
    alreadyInvited: AVERY.alreadyInvited,
  },
  {
    seekerProfileId: JORDAN.seekerProfileId,
    displayName: JORDAN.displayName,
    bio: JORDAN.shortBio,
    alreadyInvited: JORDAN.alreadyInvited,
  },
  {
    seekerProfileId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    displayName: CONTAINMENT_SEEKER_NAME,
    bio: "LongUnbrokenBiographyTokenThatMustRemainInsideTheSearchResultAndComposeCardAtPhoneWidths",
    alreadyInvited: false,
  },
] satisfies readonly SeekerSearchResult[];

const FIXTURE = {
  listings: [
    { id: ORCHARD_LISTING_ID, title: ORCHARD_LISTING_TITLE },
    { id: VINEYARD_LISTING_ID, title: "Vineyard Tasting Host" },
    { id: REMOTE_LISTING_ID, title: "Remote Guest Support" },
  ],
  invites: [
    {
      id: "dev-invite-jordan-applied",
      listingId: ORCHARD_LISTING_ID,
      listingTitle: ORCHARD_LISTING_TITLE,
      seekerProfileId: JORDAN.seekerProfileId,
      seekerDisplayName: JORDAN.displayName,
      status: "applied",
      message: "Your seasonal hospitality experience looks relevant to our crew.",
      createdAt: "2026-08-08T17:30:00.000Z",
      deliveredAt: "2026-08-08T17:31:00.000Z",
    },
    {
      id: "dev-invite-avery-declined",
      listingId: VINEYARD_LISTING_ID,
      listingTitle: "Vineyard Tasting Host",
      seekerProfileId: AVERY.seekerProfileId,
      seekerDisplayName: AVERY.displayName,
      status: "ignored",
      message: null,
      createdAt: "2026-08-07T16:00:00.000Z",
      deliveredAt: "2026-08-07T16:01:00.000Z",
    },
  ],
  entitlement: {
    tier: "professional",
    monthlyAllowance: 10,
    monthlyUsed: 3,
    monthlyRemaining: 7,
    purchasedBalance: 2,
    totalRemaining: 9,
    periodKey: "2026-08",
    ledgerAvailable: true,
  },
  buckets: [
    {
      listingId: ORCHARD_LISTING_ID,
      listingTitle: ORCHARD_LISTING_TITLE,
      category: "farm",
      locationDisplay:
        "ExtremelyLongUnbrokenLocationDisplayTokenThatMustStayInsideTheMatchedBucketAtPhoneWidths",
      state: "ready",
      seekers: [AVERY, JORDAN],
    },
    {
      listingId: VINEYARD_LISTING_ID,
      listingTitle: "Vineyard Tasting Host",
      category: "seasonal",
      locationDisplay: "Napa, California",
      state: "ready",
      seekers: [],
    },
    {
      listingId: REMOTE_LISTING_ID,
      listingTitle: "Remote Guest Support",
      category: "remote",
      locationDisplay: "Remote",
      state: "unavailable",
    },
  ],
  searchPreview: {
    notice: OUTREACH_PREVIEW_NOTICE,
    unavailableQuery: "offline",
    seekersByListingId: {
      [ORCHARD_LISTING_ID]: SEARCH_SEEKERS,
      [VINEYARD_LISTING_ID]: SEARCH_SEEKERS.map((seeker) => ({
        ...seeker,
        alreadyInvited: false,
      })),
      [REMOTE_LISTING_ID]: SEARCH_SEEKERS.map((seeker) => ({
        ...seeker,
        alreadyInvited: false,
      })),
    },
  },
} satisfies DevHostOutreachFixture;

/** Production-killed fixtures for the real host outreach route. */
export function devHostOutreachFixture(): DevHostOutreachFixture {
  return FIXTURE;
}
