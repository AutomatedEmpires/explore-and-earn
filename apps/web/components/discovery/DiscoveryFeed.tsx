import { DiscoveryCard } from "./DiscoveryCard";
import { DiscoveryCardSkeleton } from "./DiscoveryCardSkeleton";
import { EmptyState } from "./EmptyState";
import type { DiscoveryListing } from "./listing";
import styles from "./DiscoveryFeed.module.css";

export interface DiscoveryFeedProps {
  readonly listings: readonly DiscoveryListing[];
  /** Render skeleton placeholders instead of cards. */
  readonly loading?: boolean;
  /** Number of skeletons to show while loading. */
  readonly skeletonCount?: number;
  readonly heading?: string;
  readonly subheading?: string;
}

export function DiscoveryFeed({
  listings,
  loading = false,
  skeletonCount = 6,
  heading = "Discover work-travel opportunities",
  subheading = "Housing, meals, and pay — from hosts around the world.",
}: DiscoveryFeedProps) {
  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.heading}>{heading}</h1>
        <p className={styles.subheading}>{subheading}</p>
      </header>

      {loading ? (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: skeletonCount }, (_, index) => (
            <DiscoveryCardSkeleton key={index} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={styles.grid}>
          {listings.map((listing) => (
            <DiscoveryCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </section>
  );
}
