import type {
  BenefitProvision,
  BenefitTriad,
  CompensationUnit,
  DiscoveryCardConditionalBadge,
  ImageSelection,
  ListingStatus,
  OpportunityCategory,
  ResponsiveImage,
} from "@explore-and-earn/contracts";
import type { DiscoveryCardData, IconKey } from "@explore-and-earn/ui";
import type { SeekerApplicationListing } from "@explore-and-earn/db";

/**
 * Discovery & Feed lane — LOCAL fixture/view model.
 *
 * The frozen @explore-and-earn/contracts package intentionally does NOT yet
 * expose a persisted Listing object model (per card.ts that object model is
 * founder-gated and must arrive via a scoped contract build pack). So this lane
 * composes a LOCAL view-model from the enumerated contract registries
 * (categories, benefit triad, media, lifecycle, conditional badges) to drive
 * the Discovery feed against typed fixtures. When the canonical Listing
 * contract lands, replace (or map from) this type.
 *
 * The card itself is NOT defined here: every surface renders the single
 * canonical @explore-and-earn/ui DiscoveryCard. This view-model is mapped into
 * that card's DiscoveryCardData via toDiscoveryCardData below.
 */
export interface DiscoveryListingHost {
  readonly id?: string;
  readonly name: string;
  /**
   * Self-declared verified host. The badge always renders the exact qualifier
   * "Self-Declared by Host" (G22) via the VerifiedHostBadge primitive.
   */
  readonly verified: boolean;
  /** Short employer tagline for the featured employer rail (1–2 punchy sentences). */
  readonly tagline?: string;
}

/**
 * Geocoded marker position for the seeker /map Mapbox surface. Optional by
 * design: a listing can be fully discoverable in the feed without a fixed
 * point (e.g. "Remote · Worldwide"), in which case it is intentionally omitted
 * from the map. When the persisted Listing contract + geocoding land, this is
 * sourced from the listing's resolved address rather than the fixture.
 */
export interface DiscoveryListingCoordinates {
  readonly lat: number;
  readonly lon: number;
}

export interface DiscoveryListingPayInsight {
  readonly meterValue?: number;
  readonly note?: string;
  readonly minCents?: number;
  readonly maxCents?: number;
  readonly unit?: CompensationUnit | null;
  readonly currency?: string;
}

export interface DiscoveryListing {
  readonly id: string;
  /** Display title; rendered in the display font. */
  readonly title: string;
  /** One of the five canonical lanes (farm | maritime | remote | seasonal | mix). */
  readonly category: OpportunityCategory;
  readonly location: string;
  /** Human-readable opportunity window, e.g. "Aug\u2013Oct 2026". */
  readonly opportunityWindow: string;
  readonly begins?: string;
  readonly ends?: string;
  readonly status: ListingStatus;
  readonly host: DiscoveryListingHost;
  /** The always-visible Housing / Meals / Pay triad. */
  readonly benefits: BenefitTriad;
  /** Resolved cover image. Absent -> category illustration fallback. */
  readonly cover?: ImageSelection;
  /**
   * Uploaded cover photo public URL (Supabase Storage). When present, the card
   * renders this as the hero image; absent -> category illustration fallback.
   */
  readonly coverImageUrl?: string;
  /** Conditional badges shown in addition to the always-on category chip. */
  readonly conditionalBadges?: readonly DiscoveryCardConditionalBadge[];
  /**
   * Neutral relevance value 0..100, shown via the Meter primitive on matched
   * surfaces only. Never colored good/bad.
   */
  readonly matchScore?: number;
  /** Whether to surface the founding-program countdown. */
  readonly founding?: boolean;
  /** Optional pay summary + meter content for the pay popup. */
  readonly payInsight?: DiscoveryListingPayInsight;
  readonly visaSupport?: boolean;
  /**
   * Geocoded marker position for the /map surface. Optional: listings without
   * coordinates are omitted from the map (see DiscoveryListingCoordinates).
   */
  readonly coordinates?: DiscoveryListingCoordinates;
}

/** Map a canonical category to its canonical Icon registry key (never "lodge"). */
export const CATEGORY_ICON: Record<OpportunityCategory, IconKey> = {
  farm: "category.farm",
  maritime: "category.maritime",
  remote: "category.remote",
  seasonal: "category.seasonal",
  mix: "category.mix",
};

/** Human-readable category label for the category Chip. */
export const CATEGORY_LABEL: Record<OpportunityCategory, string> = {
  farm: "Farm",
  maritime: "Maritime",
  remote: "Remote",
  seasonal: "Seasonal",
  mix: "Mix",
};

/** Resolve the displayable image from a contract ImageSelection union. */
export function resolveCoverImage(
  selection: ImageSelection | undefined,
): ResponsiveImage | undefined {
  if (!selection) {
    return undefined;
  }
  return selection.source === "uploaded" ? selection.media : selection.image;
}

/** Display fallback when a benefit has no human summary. */
const PROVISION_LABEL: Record<BenefitProvision, string> = {
  provided: "Provided",
  partial: "Partial",
  not_provided: "Not provided",
};

/** Collapse a single benefit into the card's display string. */
function benefitDisplay(info: {
  readonly provision: BenefitProvision;
  readonly summary?: string;
}): string {
  return info.summary ?? PROVISION_LABEL[info.provision];
}

function inferHousingOccupancy(
  summary: string | undefined,
): "solo" | "shared" | undefined {
  if (!summary) {
    return undefined;
  }

  const normalized = summary.toLowerCase();
  if (
    normalized.includes("shared") ||
    normalized.includes("bunk") ||
    normalized.includes("dorm") ||
    normalized.includes("berth") ||
    normalized.includes("communal") ||
    normalized.includes("multiple") ||
    normalized.includes("roommate") ||
    normalized.includes("co-ed") ||
    normalized.includes("mixed")
  ) {
    return "shared";
  }

  if (
    normalized.includes("private") ||
    normalized.includes("solo") ||
    normalized.includes("single") ||
    normalized.includes("own room") ||
    normalized.includes("your own") ||
    normalized.includes("individual") ||
    normalized.includes("ensuite") ||
    normalized.includes("en-suite")
  ) {
    return "solo";
  }

  return undefined;
}

/**
 * Pure mapper: local DiscoveryListing view-model -> the canonical
 * @explore-and-earn/ui DiscoveryCardData. The richer provision/summary benefit
 * data is collapsed into the card's Housing / Meals / Pay display-string triad
 * (the card supplies the triad labels and icons itself), while the raw
 * provision is carried through as benefitProvision so the card can render the
 * green included-border on Housing & Meals. Relevance/match is carried through
 * as matchScore; the card renders it (neutral Meter) only on the "matched"
 * surface. The listing title becomes the role/position row; the host business
 * name is the card's display title.
 */
export function toDiscoveryCardData(listing: DiscoveryListing): DiscoveryCardData {
  return {
    id: listing.id,
    title: listing.title,
    hostName: listing.host.name,
    category: listing.category,
    location: listing.location,
    opportunityWindow: listing.opportunityWindow,
    begins: listing.begins,
    ends: listing.ends,
    coverImageUrl: listing.coverImageUrl,
    triad: {
      housing: benefitDisplay(listing.benefits.housing),
      meals: benefitDisplay(listing.benefits.meals),
      pay: benefitDisplay(listing.benefits.pay),
    },
    benefitProvision: {
      housing: listing.benefits.housing.provision,
      meals: listing.benefits.meals.provision,
      pay: listing.benefits.pay.provision,
    },
    housingOccupancy: inferHousingOccupancy(listing.benefits.housing.summary),
    verifiedHost: listing.host.verified,
    conditionalBadges: listing.conditionalBadges,
    matchScore: listing.matchScore,
  };
}

/**
 * Maps a DB-fetched `SeekerApplicationListing` (returned by
 * `getApplicationsForSeekerWithListings`) to `DiscoveryCardData`.
 *
 * Used by lifecycle bucket pages (accepted / not-selected / withdrawn) that
 * fetch applications directly from the DB rather than through the discovery
 * feed. Centralises the construction so changes to the shape propagate to all
 * three pages automatically.
 */
export function seekerApplicationListingToCardData(
  listing: SeekerApplicationListing,
): DiscoveryCardData {
  const housingText = listing.benefits.housing.provision === "provided"
    ? "Included"
    : listing.benefits.housing.provision === "partial"
    ? "Partial"
    : "Not included";
  const mealsText = listing.benefits.meals.provision === "provided"
    ? "Included"
    : listing.benefits.meals.provision === "partial"
    ? "Partial"
    : "Not included";
  const payText = listing.benefits.pay.summary ?? (
    listing.benefits.pay.provision === "provided"
      ? "Included"
      : listing.benefits.pay.provision === "partial"
      ? "Partial"
      : "Not included"
  );

  return {
    id: listing.id,
    title: listing.title,
    hostName: listing.host.name,
    category: listing.category,
    location: listing.location,
    opportunityWindow: listing.opportunityWindow,
    coverImageUrl: listing.coverImageUrl ?? undefined,
    triad: { housing: housingText, meals: mealsText, pay: payText },
    benefitProvision: {
      housing: listing.benefits.housing.provision,
      meals: listing.benefits.meals.provision,
      pay: listing.benefits.pay.provision,
    },
    housingOccupancy: inferHousingOccupancy(listing.benefits.housing.summary),
    verifiedHost: listing.host.verified,
  };
}
