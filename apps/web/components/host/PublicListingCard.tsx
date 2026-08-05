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

import {
  publicListingPayProvision,
  publicListingPaySummary,
} from "./publicListingCardModel";
import styles from "./PublicListingCard.module.css";

interface Props {
  readonly listing: PublicHostListing;
  /** Host business name — the card's host row (PublicHostListing omits it). */
  readonly hostName: string;
  readonly hostVerified?: boolean;
  readonly hostAvatarUrl?: string | null;
  /** Above-the-fold cards load the cover eagerly for a clean LCP. */
  readonly priority?: boolean;
  /**
   * Optional isolated destination. Public product pages omit this and keep the
   * canonical `/listing/:id` route; walkthroughs provide a namespaced route so
   * sample IDs can never fall through to production lookups.
   */
  readonly href?: string;
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
  href: hrefOverride,
}: Props) {
  const router = useRouter();
  const href = hrefOverride ?? `/listing/${listing.id}`;

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
      pay: publicListingPaySummary(listing),
    },
    benefitProvision: {
      housing: listing.housingIncluded ? "provided" : "not_provided",
      meals: listing.mealsIncluded ? "provided" : "not_provided",
      pay: publicListingPayProvision(listing),
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
