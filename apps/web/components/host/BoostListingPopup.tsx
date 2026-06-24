"use client";

import { useState, useTransition } from "react";
import { Icon } from "@explore-and-earn/ui";
import { BOOST_DURATIONS, type BoostDuration } from "@explore-and-earn/contracts";

import {
  createBoostCheckoutAction,
  BOOST_PRICING,
  type BoostCheckoutResult,
} from "../../app/actions/boost";
import { PopupShell } from "../overlay/PopupShell";
import styles from "./BoostListingPopup.module.css";

export interface BoostListingPopupProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly listingId: string;
  readonly listingTitle: string;
  /** Boost requires a live listing; a paused/draft listing shows guidance instead. */
  readonly isLive: boolean;
}

const DURATION_META: Record<
  BoostDuration,
  { label: string; tagline: string }
> = {
  7:  { label: "7-Day Boost",      tagline: "Top placement for a full week" },
  14: { label: "14-Day Spotlight", tagline: "Double the runway, more reach" },
  28: { label: "28-Day Feature",   tagline: "Maximum visibility, full month" },
};

const PERKS: ReadonlyArray<{ icon: "status.boosted" | "analytics.trend" | "analytics.meter"; label: string }> = [
  { icon: "status.boosted", label: "Top of the discovery feed" },
  { icon: "analytics.trend", label: "Highlighted on map and swipe" },
  { icon: "analytics.meter", label: "Boosted reach in your analytics" },
];

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export function BoostListingPopup({
  open,
  onClose,
  listingId,
  listingTitle,
  isLive,
}: BoostListingPopupProps) {
  const [selected, setSelected] = useState<BoostDuration>(14);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCheckout() {
    setError(null);
    startTransition(async () => {
      const result: BoostCheckoutResult = await createBoostCheckoutAction(
        listingId,
        selected,
      );
      if (result.ok) {
        window.location.href = result.sessionUrl;
        return;
      }
      setError(reasonMessage(result.reason));
    });
  }

  return (
    <PopupShell
      open={open}
      onClose={onClose}
      title="Boost listing"
      eyebrow="Premium placement"
      headerIcon={<Icon name="status.boosted" size={20} aria-hidden />}
      size="compact"
    >
      <div className={styles.body}>
        <p className={styles.intro}>
          Boost <strong className={styles.listingName}>{listingTitle}</strong> to
          the top of discovery and highlight it across map and swipe.
        </p>

        <ul className={styles.perks} role="list">
          {PERKS.map((perk) => (
            <li className={styles.perk} key={perk.icon}>
              <span className={styles.perkIcon}>
                <Icon name={perk.icon} size={16} aria-hidden />
              </span>
              {perk.label}
            </li>
          ))}
        </ul>

        {isLive ? (
          <>
            <fieldset className={styles.tierGroup}>
              <legend className={styles.legend}>Choose a duration</legend>
              {BOOST_DURATIONS.map((d) => {
                const active = selected === d;
                return (
                  <label
                    key={d}
                    className={`${styles.tier}${active ? ` ${styles.tierActive}` : ""}`}
                  >
                    <input
                      type="radio"
                      name="boost-duration"
                      value={d}
                      checked={active}
                      onChange={() => setSelected(d)}
                      disabled={isPending}
                      className={styles.tierInput}
                    />
                    <span className={styles.tierMain}>
                      <span className={styles.tierLabel}>{DURATION_META[d].label}</span>
                      <span className={styles.tierTagline}>{DURATION_META[d].tagline}</span>
                    </span>
                    <span className={styles.tierPrice}>{formatPrice(BOOST_PRICING[d])}</span>
                  </label>
                );
              })}
            </fieldset>

            <div className={styles.summary}>
              <span className={styles.summaryLabel}>
                {DURATION_META[selected].label}
              </span>
              <span className={styles.summaryPrice}>
                {formatPrice(BOOST_PRICING[selected])}
              </span>
            </div>

            {error ? (
              <p className={styles.error} role="alert">
                <Icon name="system.error" size={16} aria-hidden />
                {error}
              </p>
            ) : null}

            <button
              type="button"
              className={styles.checkoutBtn}
              onClick={handleCheckout}
              disabled={isPending}
            >
              {isPending ? "Redirecting…" : "Continue to checkout"}
              {!isPending ? <Icon name="action.forward" size={16} aria-hidden /> : null}
            </button>
            <p className={styles.fineprint}>
              Secure payment via Stripe. Boost starts as soon as payment clears.
            </p>
          </>
        ) : (
          <div className={styles.notLive} role="note">
            <Icon name="system.info" size={20} aria-hidden />
            <p>
              Only live listings can be boosted. Resume this listing first, then
              boost it for top placement.
            </p>
            <button type="button" className={styles.dismissBtn} onClick={onClose}>
              Got it
            </button>
          </div>
        )}
      </div>
    </PopupShell>
  );
}

function reasonMessage(reason: Exclude<BoostCheckoutResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "no_stripe_config":
      return "Payment is not yet configured. Contact support.";
    case "not_owner":
      return "You can only boost your own listings.";
    case "not_live":
      return "Only live listings can be boosted.";
    case "not_host":
    case "unauthenticated":
      return "Please sign in as a host to boost a listing.";
    default:
      return "Payment setup failed — please try again.";
  }
}
