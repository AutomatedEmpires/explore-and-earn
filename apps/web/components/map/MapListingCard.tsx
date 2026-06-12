"use client";

import { Icon } from "@explore-and-earn/ui";

import { CATEGORY_LABEL, type DiscoveryListing } from "../discovery";
import styles from "./MapListingCard.module.css";

export interface MapListingCardProps {
  readonly listing: DiscoveryListing;
  readonly selected?: boolean;
  readonly onSelect: (listing: DiscoveryListing) => void;
}

const CONDITIONAL_BADGE_LABEL = {
  seasonal: "Seasonal",
  boosted: "Boosted",
} as const;

const CATEGORY_CLASS = {
  farm: styles.cardFarm,
  maritime: styles.cardMaritime,
  remote: styles.cardRemote,
  seasonal: styles.cardSeasonal,
  mix: styles.cardMix,
} as const;

const BENEFIT_ICON = {
  housing: "benefit.housing",
  meals: "benefit.meals",
  pay: "benefit.pay",
} as const;

const BENEFIT_CLASS = {
  housing: styles.housingChip,
  meals: styles.mealsChip,
  pay: styles.payChip,
} as const;

export function MapListingCard({
  listing,
  selected = false,
  onSelect,
}: MapListingCardProps) {
  const hostLabel = listing.host.name.trim().slice(0, 1).toUpperCase() || "H";
  const badgeRow = [
    CATEGORY_LABEL[listing.category],
    ...(listing.conditionalBadges ?? []).map(
      (badge) => CONDITIONAL_BADGE_LABEL[badge],
    ),
  ].slice(0, 3);

  return (
    <button
      type="button"
      className={`${styles.card} ${CATEGORY_CLASS[listing.category]}${selected ? ` ${styles.cardActive}` : ""}`}
      onClick={() => onSelect(listing)}
    >
      <div className={styles.hostColumn}>
        <div className={styles.hostBadge}>
          <span className={styles.hostInitial}>{hostLabel}</span>
          {listing.host.verified ? (
            <span className={styles.verifiedMark} aria-hidden>
              <Icon name="trust.featured_employer" size={16} aria-hidden />
            </span>
          ) : null}
        </div>
        <span className={styles.hostLabel}>Host</span>
      </div>

      <div className={styles.imageColumn}>
        <div className={styles.badgeRow}>
          {badgeRow.map((badge) => (
            <span key={badge} className={styles.ribbon}>
              {badge}
            </span>
          ))}
        </div>
        {listing.coverImageUrl ? (
          <img className={styles.image} src={listing.coverImageUrl} alt={listing.title} />
        ) : (
          <div className={styles.fallback} aria-hidden>
            <Icon name="nav.map" size={24} aria-hidden />
          </div>
        )}
      </div>

      <div className={styles.contentColumn}>
        <h3 className={styles.hostName}>{listing.host.name}</h3>
        <div className={styles.infoRow}>
          <Icon name="action.apply" size={16} aria-hidden />
          <span>{listing.title}</span>
        </div>
        <div className={styles.infoRow}>
          <Icon name="nav.map" size={16} aria-hidden />
          <span>{listing.location}</span>
        </div>
        <div className={styles.metaRail}>
          <span className={styles.metaChip}>{listing.opportunityWindow}</span>
          {selected ? <span className={styles.metaChip}>Pinned</span> : null}
        </div>
        <div className={styles.benefitRow}>
          {(["housing", "meals", "pay"] as const).map((benefit) => (
            <span
              key={benefit}
              className={`${styles.benefitChip} ${BENEFIT_CLASS[benefit]}`}
            >
              <Icon name={BENEFIT_ICON[benefit]} size={16} aria-hidden />
              {benefit}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}