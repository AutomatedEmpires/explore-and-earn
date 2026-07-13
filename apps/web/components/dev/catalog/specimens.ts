/**
 * Card + Popup Catalog — specimen fixtures (dev-only).
 *
 * Pure data describing every DiscoveryCard variation the catalog renders, plus
 * the demo listing / host / resume props the sitewide popups need. Everything
 * here is derived from the local DISCOVERY_FIXTURES — NO production data, NO
 * network. Review tooling only; never bundled in a production build.
 */

import type {
  DiscoveryCardData,
  DiscoveryCardProps,
} from "@explore-and-earn/ui";
import type { SeekerResume } from "@explore-and-earn/db";

import { DISCOVERY_FIXTURES, toDiscoveryCardData } from "../../discovery";
import type { DiscoveryListing, DiscoveryListingHost } from "../../discovery";

type CardSurface = DiscoveryCardProps["surface"];
type CardState = NonNullable<DiscoveryCardProps["cardState"]>;

export interface CardSpecimen {
  readonly key: string;
  readonly caption: string;
  readonly surface: CardSurface;
  readonly cardState?: CardState;
  readonly data: DiscoveryCardData;
}

// ── Base card datasets (mapped once from the frozen fixtures) ──────────────────

const orchard = DISCOVERY_FIXTURES[0]; // farm · verified · matchScore 88
const deckhand = DISCOVERY_FIXTURES[1]; // maritime · boosted
const remote = DISCOVERY_FIXTURES[2]; // remote · no housing/meals · matchScore 72

const BASE: DiscoveryCardData = toDiscoveryCardData(orchard);
const BASE_MARITIME: DiscoveryCardData = toDiscoveryCardData(deckhand);
const BASE_REMOTE: DiscoveryCardData = toDiscoveryCardData(remote);

/** Clone the base card data with per-specimen overrides. */
function card(overrides: Partial<DiscoveryCardData> = {}): DiscoveryCardData {
  return { ...BASE, ...overrides };
}

// ── Group A · Surfaces (default state, one listing across every surface) ───────

export const SURFACE_SPECIMENS: readonly CardSpecimen[] = [
  {
    key: "surface-discovery_feed",
    caption: "discovery_feed — the Seek grid. Match pill + Skip · Apply · Save bar.",
    surface: "discovery_feed",
    data: card(),
  },
  {
    key: "surface-swipe",
    caption: "swipe — the deck. Match pill; single-action framing.",
    surface: "swipe",
    data: card(),
  },
  {
    key: "surface-map",
    caption: "map — pin detail / map listing. Match pill + decision bar.",
    surface: "map",
    data: card(),
  },
  {
    key: "surface-host_applicant_review",
    caption:
      "host_applicant_review — the SEEKER card (host reviewing an applicant). Skills replace H/M/P; Skip · Save · Schedule.",
    surface: "host_applicant_review",
    data: {
      ...BASE,
      hostName: "Avery Nguyen",
      title: "Deckhand · Line cook · Barista",
      positionTitle: "Deckhand · Line cook · Barista",
      location: "Portland, Oregon",
      matchScore: 82,
      skills: ["Food handling", "Heavy lifting", "Customer service"],
    },
  },
  {
    key: "surface-admin_review",
    caption:
      "admin_review — moderation. Report count badge + Approve · Warn · Remove strip.",
    surface: "admin_review",
    data: {
      ...BASE_MARITIME,
      reportCount: 3,
      reportCategory: "Misleading details",
    },
  },
];

// ── Group B · Seeker application states (passive surface → state CTA shows) ────

const SEEKER_STATE_SURFACE: CardSurface = "saved";

export const SEEKER_STATE_SPECIMENS: readonly CardSpecimen[] = [
  {
    key: "state-default",
    caption: "default — browse card, match pill, Skip · Apply · Save.",
    surface: "discovery_feed",
    data: card(),
  },
  {
    key: "state-matched",
    caption: "matched — high-fit card. Match meter + Quick Apply.",
    surface: "matched",
    cardState: "matched",
    data: card({ matchScore: 91 }),
  },
  {
    key: "state-saved",
    caption: "saved — kept for later. 'Saved' badge + Quick Apply.",
    surface: SEEKER_STATE_SURFACE,
    cardState: "saved",
    data: card(),
  },
  {
    key: "state-applied",
    caption: "applied — submitted. 'Applied' stamp, passive CTA.",
    surface: "applied",
    cardState: "applied",
    data: card(),
  },
  {
    key: "state-offered",
    caption: "offered — host made an offer. 'Offered' badge + Accept.",
    surface: "offered",
    cardState: "offered",
    data: card(),
  },
  {
    key: "state-accepted",
    caption: "accepted — offer accepted. 'Accepted' badge + View Details.",
    surface: SEEKER_STATE_SURFACE,
    cardState: "accepted",
    data: card(),
  },
  {
    key: "state-scheduled",
    caption: "scheduled — interview/start scheduled. 'Schedule' stamp.",
    surface: SEEKER_STATE_SURFACE,
    cardState: "scheduled",
    data: card(),
  },
  {
    key: "state-not_selected",
    caption: "not_selected — passed on. Muted 'Passed' badge, inert CTA.",
    surface: SEEKER_STATE_SURFACE,
    cardState: "not_selected",
    data: card(),
  },
  {
    key: "state-withdrawn",
    caption: "withdrawn — seeker withdrew. 'Withdrawn' badge + Re-Apply.",
    surface: SEEKER_STATE_SURFACE,
    cardState: "withdrawn",
    data: card(),
  },
  {
    key: "state-invited",
    caption: "invited — host invited the seeker. 'Invited' badge + View Invite.",
    surface: "invites",
    cardState: "invited",
    data: card(),
  },
];

// ── Group C · Boosted + match blends ───────────────────────────────────────────

export const MATCH_SPECIMENS: readonly CardSpecimen[] = [
  {
    key: "state-boosted",
    caption: "boosted — premium placement. Gold 'Boosted' stamp (no match).",
    surface: "discovery_feed",
    data: card({ matchScore: undefined, conditionalBadges: ["boosted"] }),
  },
  {
    key: "state-boosted-matched",
    caption:
      "boosted + matched — match claims center; 'Boosted' drops under the category badge.",
    surface: "discovery_feed",
    data: card({ matchScore: 88, conditionalBadges: ["boosted"] }),
  },
  {
    key: "state-match-strong",
    caption: "match — strong band (≥85%). Green-teal match pill.",
    surface: "discovery_feed",
    data: card({ matchScore: 92 }),
  },
  {
    key: "state-match-fair",
    caption: "match — fair band (55–69%). Amber match pill.",
    surface: "discovery_feed",
    data: card({ ...BASE_REMOTE, matchScore: 61 }),
  },
];

// ── Group D · Host listing states (listing management chrome) ──────────────────

const HOST_STATE_SURFACE: CardSurface = "saved";

export const HOST_STATE_SPECIMENS: readonly CardSpecimen[] = [
  {
    key: "host-draft",
    caption: "draft — unpublished. 'Draft' stamp + Edit Draft.",
    surface: HOST_STATE_SURFACE,
    cardState: "draft",
    data: card({ matchScore: undefined }),
  },
  {
    key: "host-paused",
    caption: "paused — hidden from discovery. 'Paused' badge + Resume.",
    surface: HOST_STATE_SURFACE,
    cardState: "paused",
    data: card({ matchScore: undefined }),
  },
  {
    key: "host-expired",
    caption: "expired — window closed. 'Expired' badge + Renew.",
    surface: HOST_STATE_SURFACE,
    cardState: "expired",
    data: card({ matchScore: undefined }),
  },
  {
    key: "host-filled",
    caption: "filled — all spots taken. 'Filled' stamp + Close.",
    surface: HOST_STATE_SURFACE,
    cardState: "filled",
    data: card({ matchScore: undefined }),
  },
  {
    key: "host-reported",
    caption: "reported — under moderation. Red 'Reported' stamp, inert CTA.",
    surface: HOST_STATE_SURFACE,
    cardState: "reported",
    data: card({ matchScore: undefined, reportCategory: "Safety concern" }),
  },
];

// ── Popup demo props (fixtures only, never wired to real network reads) ────────

/** A concrete listing for the listing-driven popups. */
export const DEMO_LISTING: DiscoveryListing = orchard;

/** A host + its roles for HostProfilePopup (fixtures carry no host.id). */
export const DEMO_HOST: DiscoveryListingHost = {
  ...orchard.host,
  id: "host_demo_catalog",
};

export const DEMO_HOST_LISTINGS: readonly DiscoveryListing[] =
  DISCOVERY_FIXTURES.slice(0, 3).map((listing) => ({
    ...listing,
    host: { ...listing.host, id: "host_demo_catalog", verified: true },
  }));

/** A fully-populated resume for SeekerResumePopup. */
export const DEMO_RESUME: SeekerResume = {
  profile: {
    seekerProfileId: "seeker_demo_catalog",
    bio: "Traveller chasing seasons — happiest outdoors, reliable on early shifts.",
    headline: "Seasonal all-rounder · deckhand · barista",
    displayName: "Avery Nguyen",
    location: "Portland, Oregon",
    seekingTimeline: "1_month",
    desiredCategories: ["maritime", "seasonal"],
    generalSkills: ["Food handling", "Heavy lifting", "Customer service"],
  },
  experiences: [
    {
      id: "exp_demo_1",
      companyName: "North Pacific Fisheries Co-op",
      roleTitle: "Deckhand",
      location: "Sitka, Alaska",
      startDate: "2025-06",
      endDate: "2025-08",
      isCurrent: false,
      summary: "Salmon season — gear handling, deck safety, long shifts at sea.",
      categoryTags: ["maritime"],
      skillTags: ["Heavy lifting", "Safety"],
    },
    {
      id: "exp_demo_2",
      companyName: "Summit Pass Hospitality",
      roleTitle: "Front desk & barista",
      location: "Breckenridge, Colorado",
      startDate: "2024-11",
      endDate: "2025-04",
      isCurrent: false,
      summary: "Ski-season guest services and cafe operations.",
      categoryTags: ["seasonal"],
      skillTags: ["Customer service", "POS"],
    },
  ],
  educations: [
    {
      id: "edu_demo_1",
      institution: "Portland Community College",
      programOrDegree: "AA, Hospitality Management",
      location: "Portland, Oregon",
      startDate: "2021-09",
      endDate: "2023-06",
      isCurrent: false,
      description: null,
      skillTags: ["Operations"],
    },
  ],
  certifications: [
    {
      id: "cert_demo_1",
      name: "Food Handler Card",
      issuingOrganization: "Oregon Health Authority",
      issuedAt: "2024-03",
      expiresAt: "2027-03",
      doesNotExpire: false,
      description: null,
      credentialUrl: null,
      categoryTags: ["seasonal"],
      skillTags: ["Food handling"],
    },
  ],
};
