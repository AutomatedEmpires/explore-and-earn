import Link from "next/link";
import Image from "next/image";
import type { PublicHostListing } from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";
import { CategoryBadge } from "../listing/CategoryBadge";

interface Props {
  listing: PublicHostListing;
}

export function PublicListingCard({ listing }: Props) {
  const paySummary =
    listing.compensationSummary ??
    (listing.compensationMinCents != null
      ? `${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: listing.compensationCurrency,
          maximumFractionDigits: 0,
        }).format(listing.compensationMinCents / 100)}${listing.compensationUnit && listing.compensationUnit !== "other" ? `/${listing.compensationUnit}` : ""}`
      : "See listing");

  return (
    <Link
      href={`/listing/${listing.id}`}
      style=
        display: "block",
        backgroundColor: "var(--color-surface-raised)",
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border-soft)",
        overflow: "hidden",
        textDecoration: "none",
        transition: "border-color var(--motion-fast) var(--ease-standard)",
      
    >
      {/* Cover */}
      {listing.coverPhotoUrl && (
        <div
          style=
            position: "relative",
            width: "100%",
            aspectRatio: "4 / 3",
            backgroundColor: "var(--color-surface)",
          
        >
          <Image
            src={listing.coverPhotoUrl}
            alt={listing.title}
            fill
            style= objectFit: "cover" 
          />
        </div>
      )}

      <div style= padding: "var(--space-16)" >
        {/* Category badge */}
        <div style= marginBottom: "var(--space-8)" >
          <CategoryBadge category={listing.category as any} />
        </div>

        {/* Title */}
        <h3
          style=
            fontFamily: "var(--font-display)",
            fontSize: "var(--type-card-size)",
            lineHeight: "var(--type-card-lh)",
            color: "var(--text-primary)",
            margin: 0,
            marginBottom: "var(--space-8)",
          
        >
          {listing.title}
        </h3>

        {/* Location */}
        {listing.locationDisplay && (
          <div
            style=
              display: "flex",
              alignItems: "center",
              gap: "var(--space-4)",
              fontSize: "var(--type-meta-size)",
              color: "var(--text-secondary)",
              marginBottom: "var(--space-8)",
            
          >
            <Icon name="nav.map" size={16} aria-hidden />
            <span>{listing.locationDisplay}</span>
          </div>
        )}

        {/* Pay */}
        <div
          style=
            fontSize: "var(--type-meta-size)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--text-primary)",
          
        >
          {paySummary}
        </div>
      </div>
    </Link>
  );
}
