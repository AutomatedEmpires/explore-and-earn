"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { DiscoveryCardSurface } from "@explore-and-earn/contracts";
import type { DiscoveryCardProps, IllustrationKey } from "@explore-and-earn/ui";

import {
  EmptyState,
  ListingCard,
  ListingCardProvider,
  type DiscoveryListing,
} from "../discovery";
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
 * Generic lifecycle grid: renders the shared <ListingCard> for each item (with
 * an optional per-item action slot) or the shared EmptyState when empty.
 *
 * Adopting the wrapper gives lifecycle-bucket cards (offered / invites) the same
 * Quick Peek / Benefit / Pay / Report popups + location→map + boosted / match /
 * previously-skipped markers as the discovery feed, from ONE shared popup host.
 *
 * Lifecycle listings come from the applications/invites join (ApplicationListing),
 * which does NOT carry the host id — so the "roles by this host" popup can't be
 * resolved here. The host tap therefore routes to the listing detail (where the
 * host lives) instead of opening a would-be-empty/mismatched host popup.
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
  const router = useRouter();
  const listings = useMemo(() => items.map((item) => item.listing), [items]);

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
    <ListingCardProvider
      listings={listings}
      overrides={{
        onApply: (id) => router.push(`/listing/${id}`),
        onHostClick: (id) => router.push(`/listing/${id}`),
      }}
    >
      <div className={styles.grid}>
        {items.map((item, index) => (
          <div
            key={item.listing.id}
            className={styles.cell}
            style={{ "--i": index } as CSSProperties}
          >
            <ListingCard
              listing={item.listing}
              surface={surface}
              cardState={item.cardState}
              actions={item.actions}
            />
          </div>
        ))}
      </div>
    </ListingCardProvider>
  );
}
