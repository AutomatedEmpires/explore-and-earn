import Link from "next/link";
import { Badge, Icon } from "@explore-and-earn/ui";

import { CATEGORY_LABEL } from "../discovery";
import {
  HOST_LISTING_STATE_ICON,
  HOST_LISTING_STATE_LABEL,
  type HostListingItem,
} from "./models";
import styles from "./HostListingCard.module.css";

export interface HostListingCardProps {
  readonly item: HostListingItem;
}

export function HostListingCard({ item }: HostListingCardProps) {
  const { listing, state, applicantCount, newApplicantCount } = item;

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>{listing.title}</span>
          <span className={styles.location}>
            {listing.location} · {listing.opportunityWindow}
          </span>
        </div>
        <Badge
          label={HOST_LISTING_STATE_LABEL[state]}
          icon={HOST_LISTING_STATE_ICON[state]}
        />
      </div>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Category</dt>
          <dd className={styles.statValue}>{CATEGORY_LABEL[listing.category]}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Applicants</dt>
          <dd className={styles.statValue}>{applicantCount}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>New</dt>
          <dd className={styles.statValue}>{newApplicantCount}</dd>
        </div>
      </dl>
      <Link className={styles.action} href={`/host/listings/${listing.id}`}>
        <Icon name="action.forward" size={20} aria-hidden />
        <span>Manage listing</span>
      </Link>
    </article>
  );
}
