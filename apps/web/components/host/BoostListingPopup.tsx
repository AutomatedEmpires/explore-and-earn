"use client";

import { Icon } from "@explore-and-earn/ui";

import { PopupShell } from "../overlay/PopupShell";
import styles from "./BoostListingPopup.module.css";

export interface BoostListingPopupProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly listingTitle: string;
}

export function BoostListingPopup({
  open,
  onClose,
  listingTitle,
}: BoostListingPopupProps) {
  return (
    <PopupShell
      open={open}
      onClose={onClose}
      title="Boost listing"
      eyebrow="Coming soon"
      size="compact"
    >
      <div className={styles.body}>
        <div className={styles.iconRing}>
          <Icon name="status.boosted" size={24} aria-hidden />
        </div>
        <p className={styles.intro}>
          Boosting <strong className={styles.listingName}>{listingTitle}</strong>{" "}
          gives it top placement in the discovery feed and highlights it across
          map and swipe views.
        </p>
        <ul className={styles.perks} role="list">
          <li className={styles.perk}>
            <span className={styles.perkIcon}>
              <Icon name="status.boosted" size={16} aria-hidden />
            </span>
            Featured at the top of the discovery feed
          </li>
          <li className={styles.perk}>
            <span className={styles.perkIcon}>
              <Icon name="analytics.trend" size={16} aria-hidden />
            </span>
            Highlighted placement on map and swipe
          </li>
          <li className={styles.perk}>
            <span className={styles.perkIcon}>
              <Icon name="analytics.meter" size={16} aria-hidden />
            </span>
            Boosted reach analytics in your dashboard
          </li>
        </ul>
        <p className={styles.note}>
          Boost is in early access. Reach out to get on the list.
        </p>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          Got it
        </button>
      </div>
    </PopupShell>
  );
}
