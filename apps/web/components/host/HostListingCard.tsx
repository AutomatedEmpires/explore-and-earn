"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@explore-and-earn/ui";

import {
  pauseListingAction,
  resumeListingAction,
  archiveListingAction,
} from "../../app/actions/listings";
import { CATEGORY_LABEL, CATEGORY_ICON } from "../discovery";
import { captureFunnelEvent } from "../../lib/analytics/capture";
import { HOST_WORKSPACE_EVENTS } from "../../lib/analytics/events";
import {
  HOST_LISTING_STATE_LABEL,
  isListingLifecycleStatus,
  LISTING_LIFECYCLE_ICON,
  LISTING_LIFECYCLE_LABEL,
  type HostListingItem,
} from "./models";
import { BoostListingPopup } from "./BoostListingPopup";
import styles from "./HostListingCard.module.css";

export interface HostListingCardProps {
  readonly item: HostListingItem;
}

export function HostListingCard({ item }: HostListingCardProps) {
  const { listing, state, applicantCount, newApplicantCount, readiness } = item;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [boostOpen, setBoostOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);

  // The stored status, not the folded display state: a paused listing must not
  // wear the same chip as an archived one.
  const statusLabel = isListingLifecycleStatus(listing.status)
    ? LISTING_LIFECYCLE_LABEL[listing.status]
    : HOST_LISTING_STATE_LABEL[state];
  const statusIcon = isListingLifecycleStatus(listing.status)
    ? LISTING_LIFECYCLE_ICON[listing.status]
    : undefined;

  const gaps = readiness?.gaps ?? [];
  const blocking = readiness?.blockingCount ?? 0;

  function toggleHealth() {
    const next = !healthOpen;
    setHealthOpen(next);
    // Only the open is interesting, and it carries the SHAPE of the problem —
    // how many gaps, whether any block publication — never the listing's title
    // or the host's identity.
    if (next) {
      captureFunnelEvent(HOST_WORKSPACE_EVENTS.listingHealthViewed, {
        gaps: gaps.length,
        blocking,
        status: listing.status,
      });
    }
  }

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

  const benefits = [
    { key: "housing", label: "Housing", provided: listing.benefits.housing.provision !== "not_provided" },
    { key: "meals", label: "Meals", provided: listing.benefits.meals.provision !== "not_provided" },
    { key: "pay", label: "Pay", provided: listing.benefits.pay.provision !== "not_provided" },
  ] as const;

  return (
    <>
      <article className={`${styles.card}${isPending ? ` ${styles.cardPending}` : ""}`}>
        {/* Framed cover — the photo is the product. Lane atmosphere + category
            mark stand in until the host adds a cover (frame, never filter). */}
        <div className={styles.cover} data-lane={listing.category}>
          {listing.coverImageUrl ? (
            <Image
              src={listing.coverImageUrl}
              alt=""
              fill
              sizes="(max-width: 639px) 100vw, 460px"
              className={styles.coverImg}
              unoptimized
            />
          ) : (
            <span className={styles.coverPlaceholder} aria-hidden>
              <Icon name={CATEGORY_ICON[listing.category]} size={24} />
            </span>
          )}
        </div>

        <div className={styles.head}>
          <div className={styles.titleGroup}>
            <span className={styles.category}>{CATEGORY_LABEL[listing.category]}</span>
            <span className={styles.title}>{listing.title}</span>
            <span className={styles.location}>
              <Icon name="status.open" size={16} aria-hidden />
              {listing.location && listing.location !== "Location not specified"
                ? `${listing.location} · ${listing.opportunityWindow}`
                : listing.opportunityWindow}
            </span>
          </div>
          <span className={styles.statusStack}>
            <span className="host-status" data-state={state}>
              {statusIcon ? <Icon name={statusIcon} size={14} aria-hidden /> : null}
              {statusLabel}
            </span>
            {readiness?.closingSoon && readiness.daysUntilDeadline !== null ? (
              <span className={styles.closingSoon}>
                Closes in {readiness.daysUntilDeadline}d
              </span>
            ) : null}
          </span>
        </div>

        {/* Housing / Meals / Pay — product-law triad, never collapsed */}
        <div className={styles.benefits}>
          {benefits.map((b) => (
            <span
              key={b.key}
              className={styles.benefit}
              data-provided={b.provided ? "true" : "false"}
            >
              <Icon name={b.provided ? "system.success" : "action.close"} size={16} aria-hidden />
              {b.label}
            </span>
          ))}
        </div>

        {/* Applicant summary — "new" emphasized */}
        <div className={styles.applicantRow}>
          <span className={styles.applicantCount}>
            <strong>{applicantCount}</strong> applicant{applicantCount === 1 ? "" : "s"}
          </span>
          {newApplicantCount > 0 ? (
            <span className="host-status" data-state="new">
              {newApplicantCount} new
            </span>
          ) : null}
        </div>

        {/* ── Listing health — a diagnosis with a fix, never a score ────
            Only rendered when the workspace loaded the signals; a card that
            cannot see the readiness verdict shows no chip rather than an
            optimistic "looks good". */}
        {readiness ? (
          gaps.length > 0 ? (
            <div className={styles.health} data-blocking={blocking > 0 ? "true" : undefined}>
              <button
                type="button"
                className={styles.healthToggle}
                aria-expanded={healthOpen}
                onClick={toggleHealth}
              >
                <Icon
                  name={blocking > 0 ? "system.error" : "system.info"}
                  size={16}
                  aria-hidden
                />
                <span>
                  {blocking > 0
                    ? `${blocking} thing${blocking === 1 ? "" : "s"} to fix before publishing`
                    : `${gaps.length} way${gaps.length === 1 ? "" : "s"} to strengthen this listing`}
                </span>
                <Icon name={healthOpen ? "action.close" : "action.forward"} size={14} aria-hidden />
              </button>
              {healthOpen ? (
                <ul className={styles.healthList}>
                  {gaps.map((gap) => (
                    <li key={`${gap.field}-${gap.reason}`} className={styles.healthItem}>
                      <span className={styles.healthField} data-blocking={gap.blocksPublication ? "true" : undefined}>
                        {gap.field}
                      </span>
                      <span className={styles.healthReason}>{gap.reason}</span>
                    </li>
                  ))}
                  <li className={styles.healthFix}>
                    <Link href={`/host/listings/${listing.id}/edit`}>
                      Fix these in the editor
                      <Icon name="action.forward" size={14} aria-hidden />
                    </Link>
                  </li>
                </ul>
              ) : null}
            </div>
          ) : readiness.photoEvidencePending ? (
            // Housing is included, so the gate also demands four evidence
            // photos — which live behind a per-listing RPC this list cannot
            // call. Saying "ready to publish" here would be a promise the
            // publish button might refuse to keep.
            <p className={styles.healthNote}>
              <Icon name="system.info" size={14} aria-hidden />
              Housing evidence photos are checked when you publish.
            </p>
          ) : (
            <p className={styles.healthOk}>
              <Icon name="system.success" size={14} aria-hidden />
              Nothing missing.
            </p>
          )
        ) : null}

        {actionError ? (
          <p className={styles.errorMsg} role="alert">
            {actionError}
          </p>
        ) : null}

        <div className={styles.actions}>
          <Link className={styles.manageLink} href={`/host/listings/${listing.id}`}>
            <span>Manage</span>
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
          <div className={styles.quickActions}>
            <button
              type="button"
              className={styles.boostBtn}
              onClick={() => setBoostOpen(true)}
              aria-label="Boost listing"
            >
              <Icon name="status.boosted" size={16} aria-hidden />
              <span>Boost</span>
            </button>
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
        listingId={listing.id}
        listingTitle={listing.title}
        isLive={isLive}
      />
    </>
  );
}
