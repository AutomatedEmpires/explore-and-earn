import Link from "next/link";
import Image from "next/image";
import type { PublicHostListing } from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";
import {
  projectListingPay,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";
import { CategoryBadge } from "../listing/CategoryBadge";

import styles from "./PublicListingCard.module.css";

interface Props {
  listing: PublicHostListing;
}

export function PublicListingCard({ listing }: Props) {
  const pay = projectListingPay({
    summary: listing.compensationSummary,
    minCents: listing.compensationMinCents,
    maxCents: listing.compensationMaxCents,
    unit: listing.compensationUnit,
    currency: listing.compensationCurrency,
  });

  return (
    <Link href={`/listing/${listing.id}`} className={styles.card}>
      {listing.coverPhotoUrl && (
        <div className={styles.cover}>
          <Image
            src={listing.coverPhotoUrl}
            alt={listing.title}
            fill
            style={{ objectFit: "cover" }}
          />
        </div>
      )}

      <div className={styles.body}>
        <div className={styles.categoryRow}>
          <CategoryBadge category={listing.category as MarketplaceCategory} />
        </div>

        <h3 className={styles.title}>{listing.title}</h3>

        {listing.locationDisplay && (
          <div className={styles.location}>
            <Icon name="nav.map" size={16} aria-hidden />
            <span>{listing.locationDisplay}</span>
          </div>
        )}

        <div className={styles.pay}>{pay.summary}</div>
      </div>
    </Link>
  );
}
