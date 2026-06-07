import Link from "next/link";
import Image from "next/image";
import { Badge, Icon, VerifiedHostBadge, type BadgeProps, type IconKey } from "@explore-and-earn/ui";
import type { OpportunityCategory } from "@explore-and-earn/contracts";
import type { SeekerApplicationWithListing } from "@explore-and-earn/db";

import { CATEGORY_ICON } from "../discovery";
import styles from "./ApplicationCard.module.css";

const MAPPIN_ICON: Record<OpportunityCategory, IconKey> = {
  farm: "mappin.farm",
  maritime: "mappin.maritime",
  remote: "mappin.remote",
  seasonal: "mappin.seasonal",
  mix: "mappin.mix",
};

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  applied: "neutral",
  reviewing: "info",
  saved_by_host: "match",
  offered: "success",
  accepted: "success",
  not_selected: "neutral",
  withdrawn: "neutral",
  expired: "neutral",
  active: "match",
  completed: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  reviewing: "Reviewing",
  saved_by_host: "Saved by host",
  offered: "Offer received",
  accepted: "Accepted",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
  expired: "Expired",
  active: "Active",
  completed: "Completed",
};

function benefitText(info: { readonly provision: string; readonly summary?: string }): string {
  if (info.summary) return info.summary;
  if (info.provision === "provided") return "Included";
  if (info.provision === "partial") return "Partial";
  return "Not included";
}

export interface ApplicationCardProps {
  readonly application: SeekerApplicationWithListing;
}

export function ApplicationCard({ application }: ApplicationCardProps) {
  const { listing, status } = application;
  const variant = STATUS_VARIANT[status] ?? "neutral";
  const label = STATUS_LABEL[status] ?? "Applied";
  const appliedOn = application.submittedAt
    ? new Date(application.submittedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  if (!listing) {
    return (
      <article className={styles.card}>
        <div className={styles.body}>
          <div className={styles.statusRow}>
            <Badge label={label} variant={variant} />
          </div>
          <p className={styles.title}>Listing no longer available</p>
        </div>
      </article>
    );
  }

  return (
    <article className={styles.card}>
      <div className={styles.frame}>
        {listing.coverImageUrl ? (
          <Image
            className={styles.cover}
            src={listing.coverImageUrl}
            alt={`${listing.title} cover photo`}
            fill
            sizes="(max-width: 640px) 100vw, 360px"
          />
        ) : (
          <span className={styles.coverFallback}>
            <Icon name={CATEGORY_ICON[listing.category]} size={24} aria-hidden />
          </span>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.statusRow}>
          <Badge label={label} variant={variant} />
          {appliedOn ? (
            <span className={styles.appliedOn}>Applied {appliedOn}</span>
          ) : null}
        </div>

        <h3 className={styles.title}>{listing.title}</h3>

        <div className={styles.hostRow}>
          <span className={styles.hostName}>{listing.host.name}</span>
          {listing.host.verified ? <VerifiedHostBadge /> : null}
        </div>

        <div className={styles.infoRow}>
          <Icon name={MAPPIN_ICON[listing.category]} size={16} aria-hidden />
          <span>{listing.location}</span>
        </div>

        <dl className={styles.triad}>
          <div className={styles.triadItem}>
            <Icon name="benefit.housing" size={16} aria-hidden />
            <dt className={styles.triadLabel}>Housing</dt>
            <dd className={styles.triadValue}>{benefitText(listing.benefits.housing)}</dd>
          </div>
          <div className={styles.triadItem}>
            <Icon name="benefit.meals" size={16} aria-hidden />
            <dt className={styles.triadLabel}>Meals</dt>
            <dd className={styles.triadValue}>{benefitText(listing.benefits.meals)}</dd>
          </div>
          <div className={styles.triadItem}>
            <Icon name="benefit.pay" size={16} aria-hidden />
            <dt className={styles.triadLabel}>Pay</dt>
            <dd className={styles.triadValue}>{benefitText(listing.benefits.pay)}</dd>
          </div>
        </dl>

        <div className={styles.actions}>
          <Link className={styles.linkSecondary} href={`/listing/${listing.id}`}>
            View listing
          </Link>
          {status === "offered" ? (
            <Link className={styles.linkPrimary} href={`/applied/${application.id}`}>
              View offer
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
