"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { DiscoveryCard, type DiscoveryCardProps } from "@explore-and-earn/ui";
import type { DiscoveryCardSurface } from "@explore-and-earn/contracts";

import { renderCardCoverImage } from "./CardCoverImage";
import { DiscoveryCardSkeleton } from "./DiscoveryCardSkeleton";
import { EmptyState } from "./EmptyState";
import { toDiscoveryCardData, type DiscoveryListing } from "./listing";
import {
  useListingCardPopups,
  type ListingCardActionHandler,
  type ListingCardHandlers,
  type ListingCardPopupOverrides,
} from "./useListingCardPopups";
import feedStyles from "./DiscoveryFeed.module.css";

/**
 * ListingCard — the shared card wrapper every surface renders.
 *
 * It pairs the canonical @explore-and-earn/ui DiscoveryCard (with the
 * Foundation stage's match-pill / boosted-relocation / previouslySkipped props)
 * with the shared popup wiring from useListingCardPopups, so a surface gets
 * Quick Peek + Host Profile + Benefit Trust + Pay Details + Report popups, all
 * conditional badges/tags, and location→map for free:
 *
 *   <ListingCardProvider listings={listings} overrides={{ onApply, onSave, onSkip }}>
 *     {listings.map((l) => (
 *       <ListingCard key={l.id} listing={l} surface="discovery_feed" />
 *     ))}
 *   </ListingCardProvider>
 *
 * or, for the common grid case, one component that does all of the above:
 *
 *   <ListingCardGrid
 *     listings={listings}
 *     surface="discovery_feed"
 *     overrides={{ onApply, onSave, onSkip }}
 *   />
 *
 * ONE popup host is shared across every card under a provider (exactly like
 * DiscoveryFeed), never one host per card.
 */

// ─── Context ────────────────────────────────────────────────────────────────

interface ListingCardContextValue {
  readonly handlers: ListingCardHandlers;
}

const ListingCardContext = createContext<ListingCardContextValue | null>(null);

/**
 * Access the shared handler set. Throws if used outside a ListingCardProvider /
 * ListingCardGrid — that guard is what enforces the single-popup-host rule
 * (a stray ListingCard cannot silently spin up its own popup state).
 */
export function useListingCardContext(): ListingCardContextValue {
  const ctx = useContext(ListingCardContext);
  if (ctx === null) {
    throw new Error(
      "ListingCard must be rendered inside a <ListingCardProvider> (or <ListingCardGrid>). " +
        "The provider owns the single shared popup host for all cards.",
    );
  }
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────

export interface ListingCardProviderProps {
  /**
   * Every listing reachable from this provider's cards. Used to resolve the
   * active item for each popup (and to populate the Host Profile popup's
   * "other roles by this host" list), so it MUST include every listing rendered
   * by the ListingCards underneath.
   */
  readonly listings: readonly DiscoveryListing[];
  /** Surface-wide handler overrides (e.g. onApply / onSave / onSkip). */
  readonly overrides?: ListingCardPopupOverrides;
  /**
   * Analytics surface name — makes the default card-open handler emit
   * `listing_card_opened` for this surface. See useListingCardPopups.
   */
  readonly analyticsSurface?: string;
  /** Server-attested fixture ids whose public benefit-photo detail is known empty. */
  readonly knownEmptyBenefitDetailsListingIds?: readonly string[];
  readonly children: ReactNode;
}

/**
 * Wrap any custom card layout (rail, list, map sidebar, swipe deck) in this to
 * share ONE popup host across all the ListingCards inside. The handlers are
 * stable, so opening/closing a popup never re-renders the cards.
 */
export function ListingCardProvider({
  listings,
  overrides,
  analyticsSurface,
  knownEmptyBenefitDetailsListingIds,
  children,
}: ListingCardProviderProps) {
  const { handlers, popups } = useListingCardPopups(
    listings,
    overrides,
    analyticsSurface,
    knownEmptyBenefitDetailsListingIds,
  );
  const value = useMemo<ListingCardContextValue>(() => ({ handlers }), [handlers]);

  return (
    <ListingCardContext.Provider value={value}>
      {children}
      {popups}
    </ListingCardContext.Provider>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────

/** Guards a tap-originating handler behind an optional "drag in progress" predicate. */
function guardTap(
  fn: ListingCardActionHandler | undefined,
  suppressTap: (() => boolean) | undefined,
): ListingCardActionHandler | undefined {
  if (!fn) return undefined;
  if (!suppressTap) return fn;
  return (id: string) => {
    if (suppressTap()) return;
    fn(id);
  };
}

export interface ListingCardProps {
  readonly listing: DiscoveryListing;
  readonly surface: DiscoveryCardSurface;
  readonly cardState?: DiscoveryCardProps["cardState"];
  readonly variant?: DiscoveryCardProps["variant"];
  readonly imageLoading?: "eager" | "lazy";
  /**
   * Passed straight through to DiscoveryCard's CTA slot. Note: an empty
   * fragment `<></>` is a truthy override that SUPPRESSES the CTA (used by the
   * gesture-driven swipe deck); omit it entirely to keep the default CTA.
   */
  readonly actions?: ReactNode;
  /**
   * Force the "previously skipped" photo marker. Defaults to the listing's own
   * `previouslySkipped` flag (stamped by the DB mapper on demote-but-visible
   * surfaces); the swipe deck excludes skipped listings so never sets it.
   */
  readonly previouslySkipped?: boolean;
  /**
   * Per-card handler overrides, merged OVER the shared provider handlers. Use
   * for the rare card that needs a different action than its siblings.
   */
  readonly overrides?: ListingCardPopupOverrides;
  /**
   * Tap guard for drag surfaces. Checked at the moment a card control is tapped;
   * return true to swallow the tap. The swipe deck passes a predicate that reads
   * a "did the pointer move past the drag threshold" ref, so a drag-release over
   * a button swipes instead of opening a popup, while a genuine tap still opens
   * one. Button↔div rendering stays stable (handlers are kept, just no-op'd),
   * so guarding never reflows the card mid-drag.
   */
  readonly suppressTap?: () => boolean;
}

/**
 * Render one listing as the canonical DiscoveryCard, wired to the shared popup
 * host. Must be used under a ListingCardProvider / ListingCardGrid.
 */
export function ListingCard({
  listing,
  surface,
  cardState,
  variant,
  imageLoading,
  actions,
  previouslySkipped,
  overrides,
  suppressTap,
}: ListingCardProps) {
  const { handlers } = useListingCardContext();

  // Per-card overrides win over the shared handlers; then every tap-originating
  // handler is wrapped in the drag guard (a no-op when no guard is supplied).
  const resolved = useMemo<ListingCardHandlers>(() => {
    const merged: ListingCardHandlers = overrides
      ? {
          ...handlers,
          onOpen: overrides.onOpen ?? handlers.onOpen,
          onHostClick: overrides.onHostClick ?? handlers.onHostClick,
          onHousingClick: overrides.onHousingClick ?? handlers.onHousingClick,
          onMealsClick: overrides.onMealsClick ?? handlers.onMealsClick,
          onPayClick: overrides.onPayClick ?? handlers.onPayClick,
          onReport: overrides.onReport ?? handlers.onReport,
          onDatesClick: overrides.onDatesClick ?? handlers.onDatesClick,
          onVerificationClick:
            overrides.onVerificationClick ?? handlers.onVerificationClick,
          onMatchClick: overrides.onMatchClick ?? handlers.onMatchClick,
          onShare: overrides.onShare ?? handlers.onShare,
          onLocationClick: overrides.onLocationClick ?? handlers.onLocationClick,
          onApply: overrides.onApply ?? handlers.onApply,
          onSave: overrides.onSave ?? handlers.onSave,
          onSkip: overrides.onSkip ?? handlers.onSkip,
          onSchedule: overrides.onSchedule ?? handlers.onSchedule,
          onApprove: overrides.onApprove ?? handlers.onApprove,
          onHold: overrides.onHold ?? handlers.onHold,
          onReject: overrides.onReject ?? handlers.onReject,
        }
      : handlers;

    return {
      onOpen: guardTap(merged.onOpen, suppressTap)!,
      onHostClick: guardTap(merged.onHostClick, suppressTap)!,
      onHousingClick: guardTap(merged.onHousingClick, suppressTap)!,
      onMealsClick: guardTap(merged.onMealsClick, suppressTap)!,
      onPayClick: guardTap(merged.onPayClick, suppressTap)!,
      onReport: guardTap(merged.onReport, suppressTap)!,
      onDatesClick: guardTap(merged.onDatesClick, suppressTap)!,
      onVerificationClick: guardTap(merged.onVerificationClick, suppressTap)!,
      onMatchClick: guardTap(merged.onMatchClick, suppressTap)!,
      onShare: guardTap(merged.onShare, suppressTap),
      onLocationClick: guardTap(merged.onLocationClick, suppressTap)!,
      onApply: guardTap(merged.onApply, suppressTap),
      onSave: guardTap(merged.onSave, suppressTap),
      onSkip: guardTap(merged.onSkip, suppressTap),
      onSchedule: guardTap(merged.onSchedule, suppressTap),
      onApprove: guardTap(merged.onApprove, suppressTap),
      onHold: guardTap(merged.onHold, suppressTap),
      onReject: guardTap(merged.onReject, suppressTap),
    };
  }, [handlers, overrides, suppressTap]);

  const data = useMemo(() => toDiscoveryCardData(listing), [listing]);
  const skipped = previouslySkipped ?? listing.previouslySkipped;

  return (
    <DiscoveryCard
      data={data}
      surface={surface}
      cardState={cardState}
      variant={variant}
      imageLoading={imageLoading}
      renderCoverImage={renderCardCoverImage}
      actions={actions}
      previouslySkipped={skipped}
      onOpen={resolved.onOpen}
      onHostClick={resolved.onHostClick}
      onHousingClick={resolved.onHousingClick}
      onMealsClick={resolved.onMealsClick}
      onPayClick={resolved.onPayClick}
      onReport={resolved.onReport}
      onDatesClick={resolved.onDatesClick}
      onVerificationClick={resolved.onVerificationClick}
      onMatchClick={resolved.onMatchClick}
      onShare={resolved.onShare}
      onLocationClick={resolved.onLocationClick}
      onApply={resolved.onApply}
      onSave={resolved.onSave}
      onSkip={resolved.onSkip}
      onSchedule={resolved.onSchedule}
      onApprove={resolved.onApprove}
      onHold={resolved.onHold}
      onReject={resolved.onReject}
    />
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────

export interface ListingCardGridProps {
  readonly listings: readonly DiscoveryListing[];
  readonly surface: DiscoveryCardSurface;
  /** Surface-wide handler overrides (onApply / onSave / onSkip, …). */
  readonly overrides?: ListingCardPopupOverrides;
  /** Analytics surface name for the default card-open event. */
  readonly analyticsSurface?: string;
  /** Per-listing cardState (saved / applied / offered / …); default none. */
  readonly getCardState?: (
    listing: DiscoveryListing,
  ) => DiscoveryCardProps["cardState"] | undefined;
  /** Per-listing variant; default "default". */
  readonly getVariant?: (
    listing: DiscoveryListing,
  ) => DiscoveryCardProps["variant"] | undefined;
  /** Per-listing CTA-slot override (e.g. bespoke action strips). */
  readonly getActions?: (listing: DiscoveryListing) => ReactNode;
  /**
   * First N covers load eagerly (fetchpriority=high) for a stable LCP + reliable
   * screenshots; the rest stay lazy. Default 0 (all lazy) — set for above-the-
   * fold rows.
   */
  readonly eagerCount?: number;
  /** Render skeleton placeholders instead of cards. */
  readonly loading?: boolean;
  /** Number of skeletons while loading. Default 6. */
  readonly skeletonCount?: number;
  /** Override the grid container class (defaults to the canonical feed grid). */
  readonly className?: string;
  /** Custom empty state; defaults to the "no results" EmptyState. */
  readonly emptyState?: ReactNode;
}

/**
 * The common case: a responsive grid of listing cards that share one popup
 * host, with the canonical loading / empty states. Surfaces that need a custom
 * layout (rails, map sidebars, the swipe deck) compose ListingCardProvider +
 * ListingCard directly instead.
 */
export function ListingCardGrid({
  listings,
  surface,
  overrides,
  analyticsSurface,
  getCardState,
  getVariant,
  getActions,
  eagerCount = 0,
  loading = false,
  skeletonCount = 6,
  className,
  emptyState,
}: ListingCardGridProps) {
  const gridClass = className ?? feedStyles.grid;

  if (loading) {
    return (
      <div className={gridClass} aria-busy="true">
        {Array.from({ length: skeletonCount }, (_, index) => (
          <DiscoveryCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (listings.length === 0) {
    return <>{emptyState ?? <EmptyState illustration="empty.searchNoResults" />}</>;
  }

  return (
    <ListingCardProvider
      listings={listings}
      overrides={overrides}
      analyticsSurface={analyticsSurface}
    >
      <div className={gridClass}>
        {listings.map((listing, index) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            surface={surface}
            cardState={getCardState?.(listing)}
            variant={getVariant?.(listing)}
            actions={getActions?.(listing)}
            imageLoading={index < eagerCount ? "eager" : "lazy"}
          />
        ))}
      </div>
    </ListingCardProvider>
  );
}
