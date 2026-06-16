import type { ReactNode } from "react";
import type { DiscoveryCardSurface } from "@explore-and-earn/contracts";
import { DiscoveryCard, type DiscoveryCardProps, type IllustrationKey } from "@explore-and-earn/ui";

import { EmptyState, toDiscoveryCardData, type DiscoveryListing } from "../discovery";
import styles from "./LifecycleList.module.css";

export interface LifecycleListItem {
  readonly listing: DiscoveryListing;
  /** Surface-specific status/actions rendered in the card's action slot. */
  readonly actions?: ReactNode;
  /** Lifecycle state forwarded to the card's badge and CTA logic. */
  readonly cardState?: DiscoveryCardProps["cardState"];
}

export interface LifecycleListProps {
  readonly items: readonly LifecycleListItem[];
  readonly surface: DiscoveryCardSurface;
  readonly emptyTitle: string;
  readonly emptyMessage: string;
  /** Optional spot illustration shown on the empty state. */
  readonly emptyIllustration?: IllustrationKey;
  /** Optional forward CTA shown on the empty state. */
  readonly emptyActionLabel?: string;
  readonly emptyActionHref?: string;
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
  emptyIllustration,
  emptyActionLabel,
  emptyActionHref,
}: LifecycleListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        message={emptyMessage}
        illustration={emptyIllustration}
        actionLabel={emptyActionLabel}
        actionHref={emptyActionHref}
      />
    );
  }
  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <DiscoveryCard
          key={item.listing.id}
          data={toDiscoveryCardData(item.listing)}
          surface={surface}
          cardState={item.cardState}
          actions={item.actions}
        />
      ))}
    </div>
  );
}
