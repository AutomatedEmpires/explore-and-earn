"use client";

import {
  HOST_LISTING_STATE_LABEL,
  HOST_LISTING_STATE_ORDER,
  type HostListingState,
} from "./models";
import styles from "./HostListingFilters.module.css";

export type HostListingFilter = HostListingState | "all";

export interface HostListingFiltersProps {
  readonly counts: Record<HostListingState, number>;
  readonly total: number;
  readonly active: HostListingFilter;
  readonly onSelect: (filter: HostListingFilter) => void;
}

/**
 * Listings status filter — a row of toggle buttons with live per-status counts.
 * Presentation only: selecting a filter narrows the rendered list client-side;
 * it does not mutate any listing or touch a backend.
 */
export function HostListingFilters({
  counts,
  total,
  active,
  onSelect,
}: HostListingFiltersProps) {
  return (
    <div
      className={styles.filters}
      role="group"
      aria-label="Filter listings by status"
    >
      <button
        type="button"
        className={styles.chip}
        aria-pressed={active === "all"}
        onClick={() => onSelect("all")}
      >
        <span>All</span>
        <span className={styles.count}>{total}</span>
      </button>
      {HOST_LISTING_STATE_ORDER.map((state) => (
        <button
          key={state}
          type="button"
          className={styles.chip}
          aria-pressed={active === state}
          onClick={() => onSelect(state)}
        >
          <span>{HOST_LISTING_STATE_LABEL[state]}</span>
          <span className={styles.count}>{counts[state]}</span>
        </button>
      ))}
    </div>
  );
}
