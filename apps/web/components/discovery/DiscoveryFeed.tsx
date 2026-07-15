"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DiscoveryCard } from "@explore-and-earn/ui";

import { BenefitTrustModal } from "./BenefitTrustModal";
import { DiscoveryCardSkeleton } from "./DiscoveryCardSkeleton";
import { EmptyState } from "./EmptyState";
import { HostProfilePopup } from "./HostProfilePopup";
import { PayDetailsDrawer } from "./PayDetailsDrawer";
import { QuickPeekDrawer } from "./QuickPeekDrawer";
import { ReportListingDrawer } from "./ReportListingDrawer";
import type { DiscoveryListing } from "./listing";
import { toDiscoveryCardData } from "./listing";
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
  subheading = "Housing, meals, and pay \u2014 from hosts around the world.",
}: DiscoveryFeedProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeHostId, setActiveHostId] = useState<string | null>(null);
  const [activeBenefit, setActiveBenefit] = useState<{
    readonly id: string;
    readonly bucket: "housing" | "meals";
  } | null>(null);
  const [activePayId, setActivePayId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const activeListing = useMemo(
    () => listings.find((listing) => listing.id === activeId) ?? null,
    [listings, activeId],
  );

  const activeHost = useMemo(
    () => listings.find((listing) => listing.id === activeHostId)?.host ?? null,
    [listings, activeHostId],
  );

  const activeBenefitListing = useMemo(
    () => listings.find((listing) => listing.id === activeBenefit?.id) ?? null,
    [listings, activeBenefit],
  );

  const activePayListing = useMemo(
    () => listings.find((listing) => listing.id === activePayId) ?? null,
    [listings, activePayId],
  );

  const activeReportListing = useMemo(
    () => listings.find((listing) => listing.id === reportId) ?? null,
    [listings, reportId],
  );

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
        <EmptyState illustration="empty.searchNoResults" />
      ) : (
        <>
          <div className={styles.grid}>
            {listings.map((listing) => (
              <DiscoveryCard
                key={listing.id}
                data={toDiscoveryCardData(listing)}
                surface="discovery_feed"
                onOpen={(id) => setActiveId(id)}
                onApply={(id) => router.push(`/listing/${id}`)}
                onHostClick={(id) => setActiveHostId(id)}
                onLocationClick={listing.coordinates
                  ? (id) => router.push(`/map?focus=${id}`)
                  : undefined}
                onHousingClick={(id) => setActiveBenefit({ id, bucket: "housing" })}
                onMealsClick={(id) => setActiveBenefit({ id, bucket: "meals" })}
                onPayClick={(id) => setActivePayId(id)}
                onReport={(id) => setReportId(id)}
              />
            ))}
          </div>

          <QuickPeekDrawer
            listing={activeListing}
            onClose={() => setActiveId(null)}
          />

          <HostProfilePopup
            host={activeHost}
            listings={listings}
            onClose={() => setActiveHostId(null)}
            onSelectListing={(id) => {
              setActiveHostId(null);
              setActiveId(id);
            }}
          />

          <BenefitTrustModal
            listing={activeBenefitListing}
            bucket={activeBenefit?.bucket ?? null}
            onClose={() => setActiveBenefit(null)}
          />

          <PayDetailsDrawer
            listing={activePayListing}
            onClose={() => setActivePayId(null)}
          />

          <ReportListingDrawer
            listing={activeReportListing}
            onClose={() => setReportId(null)}
          />
        </>
      )}
    </section>
  );
}
