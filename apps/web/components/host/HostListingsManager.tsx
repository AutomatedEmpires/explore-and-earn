"use client";

import { useState } from "react";

import { EmptyState } from "../discovery";
import { HostListingCard } from "./HostListingCard";
import {
  HostListingFilters,
  type HostListingFilter,
} from "./HostListingFilters";
import {
  HOST_LISTING_STATE_LABEL,
  countListingsByState,
  type HostListingItem,
  type HostListingState,
} from "./models";
import styles from "./HostListingsManager.module.css";

export interface HostListingsManagerProps {
  readonly listings: readonly HostListingItem[];
}

/**
 * Listings management view. Holds the active status filter in local state and
 * renders the filtered listing list with live per-status counts.
 *
 * Client-side filtering (not searchParams) keeps the listings page statically
 * renderable. Presentation only — no listing is mutated and nothing touches a
 * backend; filtering is a pure view concern.
 */
export function HostListingsManager({ listings }: HostListingsManagerProps) {
  const [active, setActive] = useState<HostListingFilter>("all");
  const counts = countListingsByState(listings);
  const visible =
    active === "all"
      ? listings
      : listings.filter((item) => item.state === active);

  return (
    <div className={styles.manager}>
      <HostListingFilters
        counts={counts}
        total={listings.length}
        active={active}
        onSelect={setActive}
      />
      {visible.length > 0 ? (
        <div className={styles.stack}>
          {visible.map((item) => (
            <HostListingCard key={item.listing.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={`No ${HOST_LISTING_STATE_LABEL[
            active as HostListingState
          ].toLowerCase()} listings`}
          message="Try another status filter, or post a new opportunity."
        />
      )}
    </div>
  );
}
