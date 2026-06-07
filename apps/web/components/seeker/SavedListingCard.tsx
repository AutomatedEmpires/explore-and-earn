"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Button, Icon, VerifiedHostBadge, type IconKey } from "@explore-and-earn/ui";
import type { OpportunityCategory } from "@explore-and-earn/contracts";
import type { SavedListingDetail } from "@explore-and-earn/db/client";

import { CATEGORY_ICON } from "../discovery";
import { applyAction, unsaveListingAction } from "../../app/actions/savedListings";
import styles from "./SavedListingCard.module.css";

const MAPPIN_ICON: Record<OpportunityCategory, IconKey> = {
  farm: "mappin.farm",
  maritime: "mappin.maritime",
  remote: "mappin.remote",
  seasonal: "mappin.seasonal",
  mix: "mappin.mix",
};

function benefitText(info: { readonly provision: string; readonly summary?: string }): string {
  if (info.summary) return info.summary;
  if (info.provision === "provided") return "Included";
  if (info.provision === "partial") return "Partial";
  return "Not included";
}

export interface SavedListingCardProps {
  readonly listing: SavedListingDetail;
}

export function SavedListingCard({ listing }: SavedListingCardProps) {
  const [applied, setApplied] = useState(listing.alreadyApplied);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (removed) return null;

  function handleApply() {
    setError(null);
    startTransition(async () => {
      const result = await applyAction(listing.id);
      if (result.ok) {
        setApplied(true);
      } else {
        setError(
          result.error === "already_applied"
            ? "You've already applied."
            : "Couldn't apply. Please try again.",
        );
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await unsaveListingAction(listing.id);
      if (result.ok) {
        setRemoved(true);
      } else {
        setError("Couldn't remove. Please try again.");
      }
    });
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
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
          />
        ) : (
          <span className={styles.coverFallback}>
            <Icon name={CATEGORY_ICON[listing.category]} size={24} aria-hidden />
          </span>
        )}
      </div>

      <div className={styles.body}>
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

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          {applied ? (
            <span className={styles.appliedStatus}>Applied</span>
          ) : (
            <Button variant="primary" onClick={handleApply} disabled={isPending}>
              Apply
            </Button>
          )}
          <Button variant="ghost" onClick={handleRemove} disabled={isPending}>
            Unsave
          </Button>
        </div>
      </div>
    </article>
  );
}
