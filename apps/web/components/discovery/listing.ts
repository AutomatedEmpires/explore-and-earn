import type {
  BenefitProvision,
  ImageSelection,
  ListingCoordinates,
  ListingHost,
  ListingPayInsight,
  OpportunityCategory,
  OpportunityListing,
  ResponsiveImage,
} from "@explore-and-earn/contracts";
import type { DiscoveryCardData, IconKey } from "@explore-and-earn/ui";
import type { SeekerApplicationListing } from "@explore-and-earn/db";

/**
 * Discovery & Feed lane — view model.
 *
 * `DiscoveryListing` is now a re-export alias of the canonical
 * `OpportunityListing` from `@explore-and-earn/contracts` (issues #58 / #47).
 * The sub-types (`DiscoveryListingHost`, `DiscoveryListingCoordinates`,
 * `DiscoveryListingPayInsight`) are likewise aliased to their contract
 * counterparts for backward compatibility with existing import sites.
 *
 * The card itself is NOT defined here: every surface renders the single
 * canonical @explore-and-earn/ui DiscoveryCard. This view-model is mapped into
 * that card's DiscoveryCardData via toDiscoveryCardData below.
 */

/** @deprecated Use `ListingHost` from `@explore-and-earn/contracts` instead. */
export type DiscoveryListingHost = ListingHost;

/** @deprecated Use `ListingCoordinates` from `@explore-and-earn/contracts` instead. */
export type DiscoveryListingCoordinates = ListingCoordinates;

/** @deprecated Use `ListingPayInsight` from `@explore-and-earn/contracts` instead. */
export type DiscoveryListingPayInsight = ListingPayInsight;

/** Canonical opportunity listing. Alias of `OpportunityListing` from contracts. */
export type DiscoveryListing = OpportunityListing;

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
