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

import { cloudinaryPhoto, type PhotoCategory } from "@explore-and-earn/ui";
import {
  FOUNDER_LOCKED_PRICING,
  PLAN_ENTITLEMENTS,
  type OpportunityCategory,
} from "@explore-and-earn/contracts";

import type { DiscoveryListing } from "../discovery";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";

const IS_PREVIEW = process.env.NODE_ENV !== "production";

/** cloudinaryPhoto only serves the four lane folders; map generic lanes onto them. */
function lanePhoto(category: PhotoCategory, slug: string, size: "card" | "hero" = "card") {
  return cloudinaryPhoto(category, slug, size);
}

// ─── Hero ───────────────────────────────────────────────────────────────────

export interface HomeHeroImage {
  readonly imageUrl: string;
  /** Drives the cover-gradient fallback class if the hero photo is missing. */
  readonly category: OpportunityCategory;
}

/**
 * HOME_HERO_ROTATION — the controllable hero "bucket". The homepage picks ONE of
 * these per landing (client-side, after mount) so the first impression feels
 * alive without a hydration mismatch. This is the single place the founder edits
 * to control which images can appear: add, remove, or reorder entries here.
 *
 * All entries are cool/scenic, mixed lanes (coastal · mountain · farm-at-dusk) so
 * the hero sits with the Glacier palette — a warm cover fights the ice-and-chrome
 * UI. Slugs are the same curated lane photos referenced by DESTINATION_SEEDS; if a
 * hero-size variant is missing, the category cover gradient shows underneath.
 */
export const HOME_HERO_ROTATION: readonly HomeHeroImage[] = [
  // Alaska — coastal maritime
  { imageUrl: cloudinaryPhoto("maritime", "venti-views-asmavys4azm", "hero"), category: "maritime" },
  // Colorado — alpine, winter & summer
  { imageUrl: cloudinaryPhoto("seasonal", "yuhan-du-zi9z-e8cxge", "hero"), category: "seasonal" },
  // Wyoming — parks & high country
  { imageUrl: cloudinaryPhoto("seasonal", "vincent-guth-62v7ntlkgl8", "hero"), category: "seasonal" },
  // Maine — summer coast
  { imageUrl: cloudinaryPhoto("maritime", "werner-hilversum-vfljehs-y5w", "hero"), category: "maritime" },
  // Montana — ranch land at dusk
  { imageUrl: cloudinaryPhoto("farm", "annie-spratt-jmjnnq2xfoy", "hero"), category: "farm" },
];

/** Stable SSR default — the first entry of the rotation renders on the server and
 * on the first client paint, then the client advances to a rotated pick on mount. */
export const HOME_HERO: HomeHeroImage = HOME_HERO_ROTATION[0];

// ─── Destinations ("Where will you go next?") ──────────────────────────────

export interface HomeDestination {
  readonly slug: string;
  readonly name: string;
  readonly imageUrl: string;
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
  readonly imageSlug: string;
  readonly season: string;
  readonly categories: readonly string[];
  /** Strong seasonal-market demo figures — preview only, never shipped to prod. */
  readonly demoJobs: number;
  readonly demoHosts: number;
}

const DESTINATION_SEEDS: readonly DestinationSeed[] = [
  { slug: "alaska", name: "Alaska", imageCategory: "maritime", imageSlug: "venti-views-asmavys4azm", season: "Summer salmon season", categories: ["Lodges", "Fishing", "Parks", "Remote"], demoJobs: 148, demoHosts: 32 },
  { slug: "colorado", name: "Colorado", imageCategory: "seasonal", imageSlug: "yuhan-du-zi9z-e8cxge", season: "Winter & summer", categories: ["Resorts", "Ranches", "Guiding"], demoJobs: 96, demoHosts: 24 },
  { slug: "montana", name: "Montana", imageCategory: "farm", imageSlug: "annie-spratt-jmjnnq2xfoy", season: "Spring–Fall", categories: ["Ranch", "Lodges", "Trail crews"], demoJobs: 74, demoHosts: 19 },
  { slug: "wyoming", name: "Wyoming", imageCategory: "seasonal", imageSlug: "vincent-guth-62v7ntlkgl8", season: "Park season", categories: ["Parks", "Ranch", "Hospitality"], demoJobs: 61, demoHosts: 15 },
  { slug: "maine", name: "Maine", imageCategory: "maritime", imageSlug: "werner-hilversum-vfljehs-y5w", season: "Summer coast", categories: ["Camps", "Coastal", "Hospitality"], demoJobs: 53, demoHosts: 14 },
  { slug: "california", name: "California", imageCategory: "farm", imageSlug: "meric-tuna-ce1ovmrzumq", season: "Harvest season", categories: ["Vineyards", "Farms", "Parks"], demoJobs: 88, demoHosts: 21 },
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
      imageUrl: lanePhoto(seed.imageCategory as PhotoCategory, seed.imageSlug, "card"),
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
  readonly imageCategory: OpportunityCategory;
  readonly imageUrl: string;
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
  { key: "farm", label: "Farm", imageCategory: "farm", imageUrl: lanePhoto("farm", "young-sung-jang-7-6pulwb1d0"), href: "/jobs/farm", blurb: "Orchards, ranches, harvests & greenhouses" },
  { key: "maritime", label: "Maritime", imageCategory: "maritime", imageUrl: lanePhoto("maritime", "vidar-nordli-mathisen-pjiv1ekevzk"), href: "/jobs/maritime", blurb: "Boats, docks, fisheries & processing" },
  { key: "remote", label: "Remote", imageCategory: "remote", imageUrl: lanePhoto("remote", "justin-kauffman-fpohihximhg"), href: "/jobs/remote", blurb: "Cabins, backcountry ops, guiding & off-grid" },
  { key: "seasonal", label: "Seasonal", imageCategory: "seasonal", imageUrl: lanePhoto("seasonal", "vojtech-bruzek-yrxr3bspds0"), href: "/jobs/seasonal", blurb: "Lodges, resorts, parks & hospitality" },
];

// ─── Rolling announcements (monetized rail) ────────────────────────────────

export type AnnouncementLabel = "Featured Host" | "Boosted" | "Sponsored" | "Enterprise";

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
 * fully. In an empty prod marketplace the rail carries a neutral host invitation
 * — never a fabricated listing count.
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
    label: "Featured Host",
    category: "seasonal",
    text: "Hosts are onboarding now — housing, meals & pay upfront",
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
      // REMOVED "Multi-location + team seats": team membership has a table and
      // RLS but no application code and no UI beyond a disabled button, and
      // "multi-location" is not a separate capability — it is just the listing
      // allowance above.
      // REMOVED "Priority support & trust tools": there is no support
      // entitlement, queue, or SLA anywhere in the product.
    ],
    cta: "Talk to us",
  },
];

export function formatUsd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}
