"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { SEEKER_DISCOVERY_EVENTS, captureEvent } from "../../lib/analytics";

import { BenefitTrustModal } from "./BenefitTrustModal";
import { CardDetailPopover, type CardDetailKind } from "./CardDetailPopover";
import { HostProfilePopup } from "./HostProfilePopup";
import { PayDetailsDrawer } from "./PayDetailsDrawer";
import { QuickPeekDrawer } from "./QuickPeekDrawer";
import { ReportListingDrawer } from "./ReportListingDrawer";
import type { DiscoveryListing } from "./listing";

/**
 * useListingCardPopups — the single source of truth for a listing card's popup
 * wiring. It lifts the EXACT popup state + resolvers that DiscoveryFeed owns
 * (activeId / activeHostId / activeBenefit / activePayId / reportId and the
 * useMemo resolvers) so every surface renders QuickPeekDrawer + HostProfilePopup
 * + BenefitTrustModal + PayDetailsDrawer + ReportListingDrawer ONCE, from one
 * host, rather than N per-card copies.
 *
 * Behavior is a verbatim mirror of DiscoveryFeed.tsx:36-134 (the gold-standard
 * wiring): same state shape, same resolvers, same onSelectListing hop from the
 * host popup into Quick Peek, same default onLocationClick → /map?focus=<id>.
 *
 * Returns:
 *   - `handlers` — the full DiscoveryCard callback set (stable identity, so
 *     opening/closing a popup never re-renders the cards). Popup-opening
 *     handlers are always present; onApply / onSave / onSkip and the lifecycle
 *     callbacks are present only when a surface supplies them via `overrides`.
 *   - `popups`  — the five drawers/modals, wired to the lifted state. Render
 *     this node ONCE per surface (ListingCardProvider does this for you).
 */

export type ListingCardActionHandler = (id: string) => void;

/** The full DiscoveryCard callback set, resolved from defaults + overrides. */
export interface ListingCardHandlers {
  /** Opens Quick Peek (default) — the card body / title tap target. */
  readonly onOpen: ListingCardActionHandler;
  /** Opens the Host Profile popup (default) — host badge / host name tap. */
  readonly onHostClick: ListingCardActionHandler;
  /** Opens the Benefit Trust modal on the housing bucket (default). */
  readonly onHousingClick: ListingCardActionHandler;
  /** Opens the Benefit Trust modal on the meals bucket (default). */
  readonly onMealsClick: ListingCardActionHandler;
  /** Opens the Pay Details drawer (default) — the pay triad cell tap. */
  readonly onPayClick: ListingCardActionHandler;
  /** Opens the Report Listing drawer (default) — the report flag tap. */
  readonly onReport: ListingCardActionHandler;
  /** Opens the season/timing popover (default) — the BEGINS|ENDS strip tap. */
  readonly onDatesClick: ListingCardActionHandler;
  /** Opens the "what Verified Host means" popover (default) — badge tap. */
  readonly onVerificationClick: ListingCardActionHandler;
  /** Opens the match explanation popover (default) — match pill / "Why?" tap. */
  readonly onMatchClick: ListingCardActionHandler;
  /** Share the listing. Present only when a surface supplies it. */
  readonly onShare?: ListingCardActionHandler;
  /** Focuses the listing on the map (default → router.push('/map?focus='+id)). */
  readonly onLocationClick: ListingCardActionHandler;
  /** Passthrough — present only when a surface supplies it. */
  readonly onApply?: ListingCardActionHandler;
  /** Passthrough — present only when a surface supplies it. */
  readonly onSave?: ListingCardActionHandler;
  /** Passthrough — present only when a surface supplies it. */
  readonly onSkip?: ListingCardActionHandler;
  /** Passthrough — host/admin lifecycle CTAs; present only when supplied. */
  readonly onSchedule?: ListingCardActionHandler;
  /** Passthrough — admin_review Approve; present only when supplied. */
  readonly onApprove?: ListingCardActionHandler;
  /** Passthrough — admin_review Hold; present only when supplied. */
  readonly onHold?: ListingCardActionHandler;
  /** Passthrough — admin_review Reject; present only when supplied. */
  readonly onReject?: ListingCardActionHandler;
}

/**
 * Per-surface (or per-card) overrides. Any handler supplied here REPLACES the
 * default popup opener; anything omitted keeps the shared default. onApply /
 * onSave / onSkip and the lifecycle callbacks have NO default — supply them to
 * make the corresponding CTA live.
 */
export interface ListingCardPopupOverrides {
  readonly onOpen?: ListingCardActionHandler;
  readonly onHostClick?: ListingCardActionHandler;
  readonly onHousingClick?: ListingCardActionHandler;
  readonly onMealsClick?: ListingCardActionHandler;
  readonly onPayClick?: ListingCardActionHandler;
  readonly onReport?: ListingCardActionHandler;
  readonly onDatesClick?: ListingCardActionHandler;
  readonly onVerificationClick?: ListingCardActionHandler;
  readonly onMatchClick?: ListingCardActionHandler;
  readonly onShare?: ListingCardActionHandler;
  readonly onLocationClick?: ListingCardActionHandler;
  readonly onApply?: ListingCardActionHandler;
  readonly onSave?: ListingCardActionHandler;
  readonly onSkip?: ListingCardActionHandler;
  readonly onSchedule?: ListingCardActionHandler;
  readonly onApprove?: ListingCardActionHandler;
  readonly onHold?: ListingCardActionHandler;
  readonly onReject?: ListingCardActionHandler;
}

export interface UseListingCardPopupsResult {
  readonly handlers: ListingCardHandlers;
  readonly popups: ReactNode;
}

export function useListingCardPopups(
  listings: readonly DiscoveryListing[],
  overrides?: ListingCardPopupOverrides,
  /**
   * Analytics surface name for the `listing_card_opened` event, e.g. "swipe" or
   * "map". Fired from the DEFAULT open handler, which is what makes the event
   * automatic for every surface that uses the shared popup host rather than
   * something each one has to remember. Omit it and no event is emitted (a
   * surface that overrides onOpen fires its own).
   */
  analyticsSurface?: string,
): UseListingCardPopupsResult {
  const router = useRouter();

  // ── Lifted popup state (verbatim from DiscoveryFeed) ──────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeHostId, setActiveHostId] = useState<string | null>(null);
  const [activeBenefit, setActiveBenefit] = useState<{
    readonly id: string;
    readonly bucket: "housing" | "meals";
  } | null>(null);
  const [activePayId, setActivePayId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  // One state slot for the three card explainers (dates / verification / match):
  // they share a popover host, so opening one always closes another rather than
  // stacking two dialogs over the same card.
  const [activeDetail, setActiveDetail] = useState<{
    readonly id: string;
    readonly kind: CardDetailKind;
  } | null>(null);

  // ── Active-item resolvers (verbatim from DiscoveryFeed) ───────────────────
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
  const activeDetailListing = useMemo(
    () => listings.find((listing) => listing.id === activeDetail?.id) ?? null,
    [listings, activeDetail],
  );

  // A sourced listing has NO host profile — its "host" tap must never open the
  // host-profile popup (which would present a phantom/unverified host). Route
  // it to Quick Peek instead, where the source attribution + disclosure live.
  const sourcedIds = useMemo(
    () =>
      new Set(
        listings
          .filter((listing) => listing.provenanceInfo?.provenance === "sourced")
          .map((listing) => listing.id),
      ),
    [listings],
  );

  // ── Default popup openers (stable identity) ───────────────────────────────
  const openQuickPeek = useCallback(
    (id: string) => {
      if (analyticsSurface) {
        captureEvent(SEEKER_DISCOVERY_EVENTS.listingCardOpened, {
          surface: analyticsSurface,
        });
      }
      setActiveId(id);
    },
    [analyticsSurface],
  );
  const openHost = useCallback(
    (id: string) => (sourcedIds.has(id) ? setActiveId(id) : setActiveHostId(id)),
    [sourcedIds],
  );
  const openHousing = useCallback(
    (id: string) => setActiveBenefit({ id, bucket: "housing" }),
    [],
  );
  const openMeals = useCallback(
    (id: string) => setActiveBenefit({ id, bucket: "meals" }),
    [],
  );
  const openPay = useCallback((id: string) => setActivePayId(id), []);
  const openReport = useCallback((id: string) => setReportId(id), []);
  const openDates = useCallback(
    (id: string) => setActiveDetail({ id, kind: "dates" }),
    [],
  );
  const openVerification = useCallback(
    (id: string) => setActiveDetail({ id, kind: "verification" }),
    [],
  );
  const openMatch = useCallback(
    (id: string) => setActiveDetail({ id, kind: "match" }),
    [],
  );
  const focusOnMap = useCallback(
    (id: string) => router.push(`/map?focus=${id}`),
    [router],
  );

  // Merge overrides over defaults. Depends on the individual override fields so
  // an inline `overrides` object doesn't thrash identity when nothing changed.
  const handlers = useMemo<ListingCardHandlers>(
    () => ({
      onOpen: overrides?.onOpen ?? openQuickPeek,
      onHostClick: overrides?.onHostClick ?? openHost,
      onHousingClick: overrides?.onHousingClick ?? openHousing,
      onMealsClick: overrides?.onMealsClick ?? openMeals,
      onPayClick: overrides?.onPayClick ?? openPay,
      onReport: overrides?.onReport ?? openReport,
      onDatesClick: overrides?.onDatesClick ?? openDates,
      onVerificationClick: overrides?.onVerificationClick ?? openVerification,
      onMatchClick: overrides?.onMatchClick ?? openMatch,
      onShare: overrides?.onShare,
      onLocationClick: overrides?.onLocationClick ?? focusOnMap,
      onApply: overrides?.onApply,
      onSave: overrides?.onSave,
      onSkip: overrides?.onSkip,
      onSchedule: overrides?.onSchedule,
      onApprove: overrides?.onApprove,
      onHold: overrides?.onHold,
      onReject: overrides?.onReject,
    }),
    [
      overrides?.onOpen,
      overrides?.onHostClick,
      overrides?.onHousingClick,
      overrides?.onMealsClick,
      overrides?.onPayClick,
      overrides?.onReport,
      overrides?.onDatesClick,
      overrides?.onVerificationClick,
      overrides?.onMatchClick,
      overrides?.onShare,
      overrides?.onLocationClick,
      overrides?.onApply,
      overrides?.onSave,
      overrides?.onSkip,
      overrides?.onSchedule,
      overrides?.onApprove,
      overrides?.onHold,
      overrides?.onReject,
      openQuickPeek,
      openHost,
      openHousing,
      openMeals,
      openPay,
      openReport,
      openDates,
      openVerification,
      openMatch,
      focusOnMap,
    ],
  );

  // ── The five popups, wired to lifted state (verbatim from DiscoveryFeed) ──
  const popups = (
    <>
      <QuickPeekDrawer listing={activeListing} onClose={() => setActiveId(null)} />

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

      <PayDetailsDrawer listing={activePayListing} onClose={() => setActivePayId(null)} />

      <ReportListingDrawer listing={activeReportListing} onClose={() => setReportId(null)} />

      <CardDetailPopover
        listing={activeDetailListing}
        kind={activeDetail?.kind ?? null}
        onClose={() => setActiveDetail(null)}
      />
    </>
  );

  return { handlers, popups };
}
