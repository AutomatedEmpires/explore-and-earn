import type { ReactNode } from "react";
import type { DiscoveryCardSurface } from "@explore-and-earn/contracts";
import { DiscoveryCard } from "@explore-and-earn/ui";

import { EmptyState, toDiscoveryCardData, type DiscoveryListing } from "../discovery";
import styles from "./LifecycleList.module.css";

export interface LifecycleListItem {
  readonly listing: DiscoveryListing;
  /** Surface-specific status/actions rendered in the card's action slot. */
  readonly actions?: ReactNode;
}

export interface LifecycleListProps {
  readonly items: readonly LifecycleListItem[];
  readonly surface: DiscoveryCardSurface;
  readonly emptyTitle: string;
  readonly emptyMessage: string;
}

/**
 * Generic lifecycle grid: renders the canonical DiscoveryCard for each item
 * (with an optional per-item action slot) or the shared EmptyState when empty.
 */
export function LifecycleList({
  items,
  surface,
  emptyTitle,
  emptyMessage,
}: LifecycleListProps) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }
  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <DiscoveryCard
          key={item.listing.id}
          data={toDiscoveryCardData(item.listing)}
          surface={surface}
          actions={item.actions}
        />
      ))}
    </div>
  );
}
