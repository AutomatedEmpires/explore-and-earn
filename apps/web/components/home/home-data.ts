/**
 * Home view-models — the marketplace homepage's content layer.
 *
 * Two honesty rules govern the numbers here (founder: "never seed mock data in
 * prod; real employers only"):
 *   1. Real, derived counts always win when they exist.
 *   2. Curated demo counts fill in ONLY outside production, so the prototype
 *      reads as a populated marketplace while a live/empty DB never shows a
 *      fabricated number — it shows an honest "New season" chip instead.
 *
 * This mirrors the existing NODE_ENV fixture-fallback pattern used across the
 * discovery + seeker data seams.
 */

import {
  FOUNDER_LOCKED_PRICING,
  PLAN_ENTITLEMENTS,
  type OpportunityCategory,
} from "@explore-and-earn/contracts";

import type { DiscoveryListing } from "../discovery";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";

const IS_PREVIEW = process.env.NODE_ENV !== "production";

// ─── Hero ───────────────────────────────────────────────────────────────────

export interface HomeHeroScene {
  /** Lane the scene belongs to — still used for the cover fallback tint. */
  readonly category: OpportunityCategory;
  /**
   * Catalogue slug of the hero PHOTOGRAPH (apps/web/lib/sitePhotos.ts). Every
   * entry must name a real slug; getSitePhoto throws at render on a typo, which
   * is deliberate — a marketing hero fails loudly rather than shipping a hole.
   */
  readonly photoSlug: string;
}

/**
 * HOME_HERO_ROTATION — the controllable hero "bucket". The homepage picks ONE of
 * these per landing (server-picked index, see HomeHero) so the first impression
 * varies without a hydration mismatch. This is the single place the founder edits
 * to control what can appear: add, remove, or reorder entries here.
 *
 * THE HERO IS A PHOTOGRAPH AGAIN (V2 D16/§16). Between the Cloudinary removal
 * and the Wikimedia/Unsplash pipeline landing, this rotation painted the design
 * system's lane GRADIENT because there was no photograph to show and a broken
 * <Image> is worse than an honest colour field. There is photography now — a
 * licensed, attributed, in-repo catalogue with a /credits page — so the biggest
 * surface on the site shows the places the work happens in rather than a
 * 52rem-tall colour wash. Each entry still names a different lane so the
 * rotation reads as five distinct first impressions.
 */
export const HOME_HERO_ROTATION: readonly HomeHeroScene[] = [
  { category: "maritime", photoSlug: "cda-lake-01" },
  { category: "seasonal", photoSlug: "lodge-01" },
  { category: "farm", photoSlug: "crew-02" },
  { category: "remote", photoSlug: "idaho-01" },
  { category: "mix", photoSlug: "paddle-02" },
];

/** Stable SSR default — the first entry of the rotation renders on the server and
 * on the first client paint, then the client advances to a rotated pick on mount. */
export const HOME_HERO: HomeHeroScene = HOME_HERO_ROTATION[0];

/**
 * Lane → catalogue photograph, for the tiles that used to paint a lane
 * gradient and nothing else.
 *
 * WHY A MAP AND NOT A FIELD PER TILE. The category tiles and the destination
 * cards both key off a lane, and both were rendering a 12rem-tall colour wash
 * where an image belongs. One map means a lane's photograph is chosen once; it
 * also means adding a lane fails at the type level rather than silently
 * rendering an empty band. (V2 §16 — "gradients only where photography is
 * intentionally absent AND small".)
 */
export const LANE_PHOTO: Record<OpportunityCategory, string> = {
  farm: "idaho-02",
  maritime: "dock-02",
  remote: "idaho-03",
  seasonal: "lodge-01",
  mix: "trail-02",
};

// ─── Destinations ("Where will you go next?") ──────────────────────────────

export interface HomeDestination {
  readonly slug: string;
  readonly name: string;
  /** Selects the lane cover gradient the card's image band paints. */
  readonly imageCategory: OpportunityCategory;
  readonly season: string;
  readonly categories: readonly string[];
  readonly href: string;
  /** Resolved: real count if known, else demo (preview only), else undefined. */
  readonly jobCount?: number;
  readonly hostCount?: number;
}

interface DestinationSeed {
  readonly slug: string;
  readonly name: string;
  readonly imageCategory: OpportunityCategory;
  readonly season: string;
  readonly categories: readonly string[];
  /** Strong seasonal-market demo figures — preview only, never shipped to prod. */
  readonly demoJobs: number;
  readonly demoHosts: number;
}

const DESTINATION_SEEDS: readonly DestinationSeed[] = [
  { slug: "alaska", name: "Alaska", imageCategory: "maritime", season: "Summer salmon season", categories: ["Lodges", "Fishing", "Parks", "Remote"], demoJobs: 148, demoHosts: 32 },
  { slug: "colorado", name: "Colorado", imageCategory: "seasonal", season: "Winter & summer", categories: ["Resorts", "Ranches", "Guiding"], demoJobs: 96, demoHosts: 24 },
  { slug: "montana", name: "Montana", imageCategory: "farm", season: "Spring–Fall", categories: ["Ranch", "Lodges", "Trail crews"], demoJobs: 74, demoHosts: 19 },
  { slug: "wyoming", name: "Wyoming", imageCategory: "seasonal", season: "Park season", categories: ["Parks", "Ranch", "Hospitality"], demoJobs: 61, demoHosts: 15 },
  { slug: "maine", name: "Maine", imageCategory: "maritime", season: "Summer coast", categories: ["Camps", "Coastal", "Hospitality"], demoJobs: 53, demoHosts: 14 },
  { slug: "california", name: "California", imageCategory: "farm", season: "Harvest season", categories: ["Vineyards", "Farms", "Parks"], demoJobs: 88, demoHosts: 21 },
];

/** US-state token → slug, for parsing freeform `location_display` ("Sitka, Alaska"). */
const STATE_SLUGS: Record<string, string> = {
  alaska: "alaska", colorado: "colorado", montana: "montana",
  wyoming: "wyoming", maine: "maine", california: "california",
};

function realCountsByState(listings: readonly DiscoveryListing[]) {
  const jobs = new Map<string, number>();
  const hosts = new Map<string, Set<string>>();
  for (const l of listings) {
    const tail = l.location.split(",").pop()?.trim().toLowerCase() ?? "";
    const slug = STATE_SLUGS[tail];
    if (!slug) continue;
    jobs.set(slug, (jobs.get(slug) ?? 0) + 1);
    const set = hosts.get(slug) ?? new Set<string>();
    set.add(l.host.name);
    hosts.set(slug, set);
  }
  return { jobs, hosts };
}

/**
 * Destination cards for the homepage.
 *
 * HONESTY + DEAD-END RULE (UX review 2026-07-23): a destination is rendered
 * ONLY when it actually has live inventory. Previously all six seeds always
 * rendered; in production (where the derived count is undefined) that put six
 * large, inviting cards on the homepage — Alaska, Colorado, Montana, Wyoming,
 * Maine, California — each linking to `/seek?location=<state>` and each
 * landing on an empty result set. The copy was honest ("New season", never a
 * fabricated number) but the EXPERIENCE was six guaranteed dead ends at the
 * exact moment a first-time seeker is deciding whether this marketplace has
 * anything for them. Empty states must guide toward action, not manufacture
 * disappointment.
 *
 * Preview keeps the curated demo figures so the design can be reviewed
 * populated; production shows only destinations backed by real listings, and
 * the section hides itself entirely when none qualify (see DestinationGrid).
 */
export function buildDestinations(
  listings: readonly DiscoveryListing[],
): readonly HomeDestination[] {
  const { jobs, hosts } = realCountsByState(listings);
  return DESTINATION_SEEDS.filter(
    (seed) => IS_PREVIEW || (jobs.get(seed.slug) ?? 0) > 0,
  ).map((seed) => {
    // Preview reads as a populated seasonal marketplace via the curated demo
    // figures; production shows only real derived counts (0 → "New season"),
    // so a live/empty DB never displays a fabricated number.
    const jobCount = IS_PREVIEW ? seed.demoJobs : jobs.get(seed.slug);
    const hostCount = IS_PREVIEW ? seed.demoHosts : hosts.get(seed.slug)?.size;
    return {
      slug: seed.slug,
      name: seed.name,
      imageCategory: seed.imageCategory,
      season: seed.season,
      categories: seed.categories,
      // /seek filters location as a freeform substring, so pass the state name
      // ("Alaska" matches "Sitka, Alaska"). No dedicated state filter exists.
      href: `/seek?location=${encodeURIComponent(seed.name)}`,
      jobCount,
      hostCount,
    };
  });
}

// ─── Browse by category ────────────────────────────────────────────────────

export interface HomeCategory {
  readonly key: string;
  readonly label: string;
  /** Selects the lane cover gradient the tile paints. */
  readonly imageCategory: OpportunityCategory;
  readonly href: string;
  readonly blurb: string;
}

/**
 * The FOUR canonical marketplace lanes — mirrors MARKETPLACE_CATEGORIES and the
 * Discovery Card's category stamp exactly. Seekers browse by lane; the dozen
 * sub-roles each lane contains (hospitality, parks, resorts, guiding, trades…)
 * live inside /seek as filters, not as top-level categories. The homepage
 * previously fanned Seasonal into five role-tiles, fracturing the taxonomy into
 * a false "eight categories" — the blurb now carries that breadth instead.
 */
// Tiles link the indexable /jobs/{lane} landing pages (2026-07-23) — the
// crawlable category surface. Each landing page carries a "Filter & sort in
// Seek" CTA, so the /seek?category= path is one click deeper, not gone.
export const HOME_CATEGORIES: readonly HomeCategory[] = [
  { key: "farm", label: "Farm", imageCategory: "farm", href: "/jobs/farm", blurb: "Orchards, ranches, harvests & greenhouses" },
  { key: "maritime", label: "Maritime", imageCategory: "maritime", href: "/jobs/maritime", blurb: "Boats, docks, fisheries & processing" },
  { key: "remote", label: "Remote", imageCategory: "remote", href: "/jobs/remote", blurb: "Cabins, backcountry ops, guiding & off-grid" },
  { key: "seasonal", label: "Seasonal", imageCategory: "seasonal", href: "/jobs/seasonal", blurb: "Lodges, resorts, parks & hospitality" },
];

// ─── Rolling announcements (monetized rail) ────────────────────────────────

/**
 * "Featured Host", "Boosted", "Sponsored" and "Enterprise" are the PAID
 * taxonomy — a card wearing one asserts that someone bought that placement.
 * "Explore & Earn" is the house label, for our own invitations. It exists
 * because the empty-marketplace fallback used to ship as "Featured Host": on a
 * marketplace with zero listings and zero paying hosts, the live homepage
 * advertised a featured host that did not exist.
 */
export type AnnouncementLabel =
  | "Featured Host"
  | "Boosted"
  | "Sponsored"
  | "Enterprise"
  | "Explore & Earn";

/** The paid placements. A house card must never carry one of these. */
export const PAID_ANNOUNCEMENT_LABELS = [
  "Featured Host",
  "Boosted",
  "Sponsored",
  "Enterprise",
] as const satisfies readonly AnnouncementLabel[];

/** Our own invitation — bought by nobody, so it claims nothing. */
export const HOUSE_ANNOUNCEMENT_LABEL = "Explore & Earn" as const;

export interface HomeAnnouncement {
  readonly id: string;
  readonly label: AnnouncementLabel;
  readonly category: OpportunityCategory;
  readonly text: string;
  readonly href: string;
}

// Demo units lead with the paid taxonomy (Boosted / Sponsored / Enterprise) so
// the monetization surface reads clearly in preview.
const DEMO_ANNOUNCEMENTS: readonly HomeAnnouncement[] = [
  { id: "a1", label: "Boosted", category: "maritime", text: "Housing included · 42 new Alaska lodge roles", href: "/seek?location=Alaska" },
  { id: "a2", label: "Sponsored", category: "farm", text: "Ranch hands needed for the fall season", href: "/seek?category=farm" },
  { id: "a3", label: "Enterprise", category: "seasonal", text: "Mountain resort hiring across 5 locations", href: "/for-hosts" },
  { id: "a4", label: "Featured Host", category: "seasonal", text: "Glacier Ridge Lodge is hiring cooks & housekeepers", href: "/for-hosts" },
  { id: "a5", label: "Boosted", category: "remote", text: "Remote ops roles — apply this week", href: "/seek?category=remote" },
];

/**
 * Real featured-employer campaigns become "Featured Host" announcements; in
 * preview they're interleaved with the demo taxonomy so the paid surface reads
 * fully.
 *
 * In an empty production marketplace the rail carries OUR OWN invitation, under
 * the house label. The previous version claimed to be "a neutral host
 * invitation" while shipping it as `label: "Featured Host"` with the paid
 * featured tone — so with zero listings and zero paying hosts, the live
 * homepage showed a "Hiring now" rail containing a "Featured Host". Both were
 * false, and it is the same fabricated-trust-signal class as an unearned
 * Verified badge.
 */
export function buildAnnouncements(
  employers: readonly FeaturedEmployer[],
): readonly HomeAnnouncement[] {
  const fromEmployers: HomeAnnouncement[] = employers.slice(0, 4).map((e, i) => ({
    id: `emp_${e.listingId}_${i}`,
    label: "Featured Host",
    category: e.category,
    text: `${e.hostName} is hiring in ${e.location}`,
    href: e.hostId ? `/host/${e.hostId}` : `/listing/${e.listingId}`,
  }));

  if (IS_PREVIEW) {
    const merged: HomeAnnouncement[] = [];
    const len = Math.max(fromEmployers.length, DEMO_ANNOUNCEMENTS.length);
    for (let i = 0; i < len; i++) {
      if (DEMO_ANNOUNCEMENTS[i]) merged.push(DEMO_ANNOUNCEMENTS[i]);
      if (fromEmployers[i]) merged.push(fromEmployers[i]);
    }
    return merged.slice(0, 8);
  }

  if (fromEmployers.length > 0) return fromEmployers;
  return [{
    id: "host_onboarding",
    label: HOUSE_ANNOUNCEMENT_LABEL,
    category: "seasonal",
    // Also reworded: "Hosts are onboarding now" asserted activity we cannot
    // evidence on an empty marketplace. An invitation claims nothing.
    text: "Hiring? List your opportunity — housing, meals & pay upfront",
    href: "/for-hosts",
  }];
}

// ─── Host plans (real, founder-locked pricing) ─────────────────────────────

export interface HomePlan {
  readonly key: "starter" | "professional" | "enterprise";
  readonly name: string;
  /** Standard monthly rate from the canonical pricing contract. */
  readonly priceMonthlyCents: number;
  readonly blurb: string;
  readonly features: readonly string[];
  readonly featured?: boolean;
  readonly cta: string;
}

/**
 * The team-seat bullet, or nothing.
 *
 * Takes a plain `number` on purpose: PLAN_ENTITLEMENTS is `as const`, so reading
 * the field directly narrows it to the literal 0 and the singular/plural test
 * becomes a compile error rather than a runtime branch. Widening keeps the
 * pluralisation honest for whatever number the contract eventually carries.
 */
function teamSeatFeature(seats: number): string[] {
  if (seats <= 0) return [];
  return [`${seats} team seat${seats === 1 ? "" : "s"} alongside the owner`];
}

export const HOME_PLANS: readonly HomePlan[] = [
  {
    key: "starter",
    name: "Starter",
    priceMonthlyCents: FOUNDER_LOCKED_PRICING.starter.monthly,
    blurb: "A single location getting its first season staffed.",
    features: [
      `${PLAN_ENTITLEMENTS.starter.listings} active listing`,
      "Applicant inbox",
      "Verified-host badge",
      "Community host profile",
    ],
    cta: "Start hiring",
  },
  {
    key: "professional",
    name: "Professional",
    priceMonthlyCents: FOUNDER_LOCKED_PRICING.professional.monthly,
    blurb: "Hosts hiring across a full season.",
    features: [
      `Up to ${PLAN_ENTITLEMENTS.professional.listings} active listings`,
      // Backed: getHomepageFallbackListings sorts by subscription tier
      // (Enterprise -> Professional -> Starter), so a paid tier really does
      // place above an unpaid one.
      "Boosted placement",
      `${PLAN_ENTITLEMENTS.professional.monthlyAnnouncements} announcement / month`,
      "Applicant pipeline + full analytics",
      `${PLAN_ENTITLEMENTS.professional.includedInviteCredits} invite credits / month`,
      // REMOVED "Featured-employer eligibility": buildFeaturedEmployers groups
      // listings by host name with no tier gate at all, so every host is
      // already "eligible". Selling eligibility implies a paid gate that does
      // not exist.
    ],
    featured: true,
    cta: "Go Professional",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceMonthlyCents: FOUNDER_LOCKED_PRICING.enterprise.monthly,
    blurb: "Multi-location operators hiring at scale.",
    features: [
      `${PLAN_ENTITLEMENTS.enterprise.listings}+ active listings`,
      // Backed: top of the tier sort in getHomepageFallbackListings.
      "Homepage placement",
      `${PLAN_ENTITLEMENTS.enterprise.monthlyAnnouncements} announcements / month`,
      `${PLAN_ENTITLEMENTS.enterprise.includedInviteCredits} invite credits / month`,
      "Applicant pipeline + full analytics",
      // Derived, and currently EMPTY. TEAM_SEATS_BY_TIER holds every tier at 0
      // because accepting a team invitation grants no access to anything — the
      // invite plumbing exists (migration 085) but no policy admits a member to
      // a listing, an applicant or an analytics figure. The ternary is not
      // decoration: it is what keeps this card from selling a seat nobody gets,
      // and it will render the bullet by itself the day the number can honestly
      // rise.
      ...teamSeatFeature(PLAN_ENTITLEMENTS.enterprise.teamSeats),
      // STILL REMOVED — "multi-location" is not a separate capability, it is
      // just the listing allowance above; and "Priority support & trust tools"
      // has no support entitlement, queue, or SLA anywhere in the product.
    ],
    cta: "Talk to us",
  },
];

export function formatUsd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}
