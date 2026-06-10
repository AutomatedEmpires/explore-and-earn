"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Icon } from "@explore-and-earn/ui";

import {
  pauseListingAction,
  resumeListingAction,
  archiveListingAction,
} from "../../app/actions/listings";
import { CATEGORY_LABEL } from "../discovery";
import {
  HOST_LISTING_STATE_ICON,
  HOST_LISTING_STATE_LABEL,
  type HostListingItem,
} from "./models";
import { BoostListingPopup } from "./BoostListingPopup";
import styles from "./HostListingCard.module.css";

export interface HostListingCardProps {
  readonly item: HostListingItem;
}

export function HostListingCard({ item }: HostListingCardProps) {
  const { listing, state, applicantCount, newApplicantCount } = item;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [boostOpen, setBoostOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isLive = listing.status === "live";
  const isPaused = listing.status === "paused";
  const canPause = isLive;
  const canResume = isPaused;
  const canArchive =
    listing.status !== "archived" &&
    listing.status !== "draft" &&
    listing.status !== "under_review";

  function handlePause() {
    setActionError(null);
    startTransition(async () => {
      const result = await pauseListingAction(listing.id);
      if (!result.ok) {
        setActionError(result.error ?? "Could not pause listing.");
      } else {
        router.refresh();
      }
    });
  }

  function handleResume() {
    setActionError(null);
    startTransition(async () => {
      const result = await resumeListingAction(listing.id);
      if (!result.ok) {
        setActionError(result.error ?? "Could not resume listing.");
      } else {
        router.refresh();
      }
    });
  }

  function handleArchive() {
    setActionError(null);
    startTransition(async () => {
      const result = await archiveListingAction(listing.id);
      if (!result.ok) {
        setActionError(result.error ?? "Could not archive listing.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <article className={`${styles.card}${isPending ? ` ${styles.cardPending}` : ""}`}>
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
        {actionError ? (
          <p className={styles.errorMsg} role="alert">
            {actionError}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Link className={styles.manageLink} href={`/host/listings/${listing.id}`}>
            <Icon name="action.forward" size={20} aria-hidden />
            <span>Manage</span>
          </Link>
          <div className={styles.quickActions}>
            {canPause ? (
              <button
                type="button"
                className={styles.quickBtn}
                onClick={handlePause}
                disabled={isPending}
                aria-label="Pause listing"
                title="Pause"
              >
                <Icon name="action.close" size={16} aria-hidden />
              </button>
            ) : null}
            {canResume ? (
              <button
                type="button"
                className={styles.quickBtn}
                onClick={handleResume}
                disabled={isPending}
                aria-label="Resume listing"
                title="Resume"
              >
                <Icon name="status.open" size={16} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className={`${styles.quickBtn} ${styles.quickBtnBoost}`}
              onClick={() => setBoostOpen(true)}
              aria-label="Boost listing"
              title="Boost"
            >
              <Icon name="status.boosted" size={16} aria-hidden />
            </button>
            {canArchive ? (
              <button
                type="button"
                className={`${styles.quickBtn} ${styles.quickBtnArchive}`}
                onClick={handleArchive}
                disabled={isPending}
                aria-label="Archive listing"
                title="Archive"
              >
                <Icon name="action.sort" size={16} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </article>
      <BoostListingPopup
        open={boostOpen}
        onClose={() => setBoostOpen(false)}
        listingTitle={listing.title}
      />
    </>
  );
}
