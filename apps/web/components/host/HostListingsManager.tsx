"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { HostListingCard } from "./HostListingCard";
import {
  countClosingSoon,
  countListingsByStatus,
  isListingLifecycleStatus,
  LISTING_LIFECYCLE_LABEL,
  LISTING_LIFECYCLE_STATUSES,
  type HostListingItem,
  type ListingLifecycleStatus,
} from "./models";
import styles from "./HostListingsManager.module.css";

/**
 * The listings management surface (spec §6).
 *
 * Three things the previous version could not do, each of which a host running
 * more than two roles needs every day:
 *
 * 1. SEARCH. There was none, so a host with ten listings scrolled.
 * 2. THE REAL STATUSES. The old chips ran off `dbStatusToHostState`, which folds
 *    `paused` and `archived` into one "Closed" chip and `under_review` into
 *    "Draft" — you could not find a paused listing at all. The tabs here read
 *    `listings.status` as stored.
 * 3. SORT. Newest-first was the only order, so "which of these is closing" was a
 *    question you answered by reading every card.
 *
 * All three are client-side over the already-loaded set: the page is a
 * force-dynamic server render of the host's own inventory, so there is nothing
 * to fetch and no state worth putting in the URL.
 */

type TabId = ListingLifecycleStatus | "all" | "closing_soon";

type SortId = "recent" | "deadline" | "applicants" | "title";

const SORT_LABEL: Record<SortId, string> = {
  recent: "Newest first",
  deadline: "Closing soonest",
  applicants: "Most applicants",
  title: "Title (A–Z)",
};

export interface HostListingsManagerProps {
  readonly listings: readonly HostListingItem[];
}

function matchesQuery(item: HostListingItem, query: string): boolean {
  if (!query) return true;
  const haystack = [
    item.listing.title,
    item.listing.location,
    item.listing.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function HostListingsManager({ listings }: HostListingsManagerProps) {
  const [tab, setTab] = useState<TabId>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortId>("recent");

  const counts = useMemo(() => countListingsByStatus(listings), [listings]);
  const closingSoon = useMemo(() => countClosingSoon(listings), [listings]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = listings.filter((item) => {
      if (!matchesQuery(item, needle)) return false;
      if (tab === "all") return true;
      if (tab === "closing_soon") return item.readiness?.closingSoon === true;
      return item.listing.status === tab;
    });

    const sorted = [...filtered];
    switch (sort) {
      case "deadline":
        // Listings with no deadline sort last rather than first — an absent date
        // is not "closing now".
        sorted.sort((a, b) => {
          const left = a.deadlineAt ?? "";
          const right = b.deadlineAt ?? "";
          if (!left && !right) return 0;
          if (!left) return 1;
          if (!right) return -1;
          return left.localeCompare(right);
        });
        break;
      case "applicants":
        sorted.sort((a, b) => b.applicantCount - a.applicantCount);
        break;
      case "title":
        sorted.sort((a, b) => a.listing.title.localeCompare(b.listing.title));
        break;
      default:
        break; // the incoming order is already created_at desc
    }
    return sorted;
  }, [listings, query, sort, tab]);

  // Only statuses the host actually has get a tab. Six empty tabs would be six
  // dead ends, and "Archived (0)" teaches nothing.
  const tabs: readonly { readonly id: TabId; readonly label: string; readonly count: number }[] =
    [
      { id: "all" as const, label: "All", count: listings.length },
      ...(closingSoon > 0
        ? [{ id: "closing_soon" as const, label: "Closing soon", count: closingSoon }]
        : []),
      ...LISTING_LIFECYCLE_STATUSES.filter((status) => counts[status] > 0).map(
        (status) => ({
          id: status as TabId,
          label: LISTING_LIFECYCLE_LABEL[status],
          count: counts[status],
        }),
      ),
    ];

  const tabLabel =
    tab === "all"
      ? "All"
      : tab === "closing_soon"
        ? "Closing soon"
        : isListingLifecycleStatus(tab)
          ? LISTING_LIFECYCLE_LABEL[tab]
          : "All";

  return (
    <div className={styles.manager}>
      <div className={styles.controls}>
        <div className={styles.search}>
          <Icon name="nav.seek" size={18} aria-hidden />
          <input
            type="search"
            className={styles.searchInput}
            value={query}
            placeholder="Search your listings by title, place, or category"
            aria-label="Search your listings"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <label className={styles.sort}>
          <span className={styles.sortLabel}>Sort</span>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(event) => setSort(event.target.value as SortId)}
          >
            {(Object.keys(SORT_LABEL) as SortId[]).map((id) => (
              <option key={id} value={id}>
                {SORT_LABEL[id]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Filter listings by status">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={styles.tab}
            data-active={tab === entry.id ? "true" : undefined}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            <span className={`${styles.tabCount} ui-tabular`}>{entry.count}</span>
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <div className={styles.grid}>
          {visible.map((item) => (
            <HostListingCard key={item.listing.id} item={item} />
          ))}
        </div>
      ) : (
        <div className={styles.noResults} role="status">
          <p className={styles.noResultsTitle}>
            {query
              ? `Nothing in ${tabLabel} matches “${query.trim()}”`
              : `No ${tabLabel.toLowerCase()} listings`}
          </p>
          <div className={styles.noResultsActions}>
            {query ? (
              <button
                type="button"
                className={styles.noResultsBtn}
                onClick={() => setQuery("")}
              >
                Clear search
              </button>
            ) : null}
            {tab !== "all" ? (
              <button
                type="button"
                className={styles.noResultsBtn}
                onClick={() => setTab("all")}
              >
                Show all listings
              </button>
            ) : null}
            <Link className={styles.noResultsLink} href="/host/listings/new">
              Create a listing
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
