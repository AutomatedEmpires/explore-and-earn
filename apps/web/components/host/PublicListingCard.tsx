"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicHostListing } from "@explore-and-earn/db";
import {
  DiscoveryCard,
  Icon,
  type DiscoveryCardData,
} from "@explore-and-earn/ui";
import type { MarketplaceCategory } from "@explore-and-earn/contracts";

import styles from "./PublicListingCard.module.css";

interface Props {
  readonly listing: PublicHostListing;
  /** Host business name — the card's host row (PublicHostListing omits it). */
  readonly hostName: string;
  readonly hostVerified?: boolean;
  readonly hostAvatarUrl?: string | null;
  /** Above-the-fold cards load the cover eagerly for a clean LCP. */
  readonly priority?: boolean;
}

function paySummary(listing: PublicHostListing): string {
  if (listing.compensationSummary) return listing.compensationSummary;
  if (listing.compensationMinCents != null) {
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: listing.compensationCurrency,
      maximumFractionDigits: 0,
    }).format(listing.compensationMinCents / 100);
    const unit =
      listing.compensationUnit && listing.compensationUnit !== "other"
        ? `/${listing.compensationUnit}`
        : "";
    return `${amount}${unit}`;
  }
  return "See listing";
}

/**
 * PublicListingCard — composes the LOCKED DiscoveryCard for the host public
 * profile's Opportunities section. It never edits the card: it maps a
 * `PublicHostListing` onto `DiscoveryCardData` and overrides only the CTA with a
 * crawlable "View opportunity" link (a public SEO surface wants a real <a href>,
 * and an anonymous visitor gets a single clear destination rather than the
 * seeker Skip/Apply/Save decision bar).
 */
export function PublicListingCard({
  listing,
  hostName,
  hostVerified,
  hostAvatarUrl,
  priority = false,
}: Props) {
  const router = useRouter();
  const href = `/listing/${listing.id}`;

  const data: DiscoveryCardData = {
    id: listing.id,
    hostName,
    title: listing.title,
    category: listing.category as MarketplaceCategory,
    location: listing.locationDisplay ?? "",
    opportunityWindow: "",
    coverImageUrl: listing.coverPhotoUrl ?? undefined,
    hostAvatarUrl: hostAvatarUrl ?? undefined,
    verifiedHost: hostVerified,
    triad: {
      housing: listing.housingIncluded ? "Included" : "Not included",
      meals: listing.mealsIncluded ? "Included" : "Not included",
      pay: paySummary(listing),
    },
    benefitProvision: {
      housing: listing.housingIncluded ? "provided" : "not_provided",
      meals: listing.mealsIncluded ? "provided" : "not_provided",
      pay: "provided",
    },
  };

  return (
    <DiscoveryCard
      data={data}
      surface="discovery_feed"
      imageLoading={priority ? "eager" : "lazy"}
      onOpen={() => router.push(href)}
      actions={
        <Link href={href} className={styles.cta}>
          <Icon name="action.view" size={16} aria-hidden />
          View opportunity
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      }
    />
  );
}
