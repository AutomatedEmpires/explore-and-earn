import type {
  BenefitTriad,
  DiscoveryCardConditionalBadge,
  ImageSelection,
  ListingStatus,
  OpportunityCategory,
  ResponsiveImage,
} from "@explore-and-earn/contracts";
import type { IconKey } from "@explore-and-earn/ui";

/**
 * Discovery & Feed lane — LOCAL fixture/view model.
 *
 * The frozen @explore-and-earn/contracts package intentionally does NOT yet
 * expose a persisted Listing object model (per card.ts that object model is
 * founder-gated and must arrive via a scoped contract build pack). So this lane
 * composes a LOCAL view-model from the enumerated contract registries
 * (categories, benefit triad, media, lifecycle, conditional badges) to drive
 * the Discovery card + feed against typed fixtures. When the canonical Listing
 * contract lands, replace (or map from) this type.
 */
export interface DiscoveryListingHost {
  readonly name: string;
  /**
   * Self-declared verified host. The badge always renders the exact qualifier
   * "Self-Declared by Host" (G22) via the VerifiedHostBadge primitive.
   */
  readonly verified: boolean;
}

export interface DiscoveryListing {
  readonly id: string;
  /** Display title; rendered in the display font. */
  readonly title: string;
  /** One of the five canonical lanes (farm | maritime | remote | seasonal | mix). */
  readonly category: OpportunityCategory;
  readonly location: string;
  /** Human-readable opportunity window, e.g. "Aug–Oct 2026". */
  readonly opportunityWindow: string;
  readonly status: ListingStatus;
  readonly host: DiscoveryListingHost;
  /** The always-visible Housing / Meals / Pay triad. */
  readonly benefits: BenefitTriad;
  /** Resolved cover image. Absent -> category illustration fallback. */
  readonly cover?: ImageSelection;
  /** Conditional badges shown in addition to the always-on category chip. */
  readonly conditionalBadges?: readonly DiscoveryCardConditionalBadge[];
  /**
   * Neutral relevance value 0..100, shown via the Meter primitive on matched
   * surfaces only. Never colored good/bad.
   */
  readonly matchScore?: number;
  /** Whether to surface the founding-program countdown. */
  readonly founding?: boolean;
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
