"use client";

import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import type { DiscoveryListing } from "../discovery";
import { CATEGORY_LABEL } from "../discovery";
import styles from "./MatchCardRail.module.css";

function formatPay(insight: DiscoveryListing["payInsight"]): string | null {
  if (!insight) return null;
  if (insight.minCents != null && insight.unit) {
    const dollars = Math.round(insight.minCents / 100);
    return `$${dollars}/${insight.unit}`;
  }
  return insight.note ?? null;
}

export interface MatchCardRailProps {
  readonly listings: readonly DiscoveryListing[];
  readonly title?: string;
}

// Tokenized category atmospheres (shared with hero/profile/featured surfaces).
const CATEGORY_COLORS: Record<string, string> = {
  maritime: "var(--gradient-category-maritime)",
  farm: "var(--gradient-category-farm)",
  remote: "var(--gradient-category-remote)",
  seasonal: "var(--gradient-category-seasonal)",
  mix: "var(--gradient-category-mix)",
};

const DEFAULT_COLOR = "var(--gradient-category-default)";

function ScoreBadge({ score }: { score: number }) {
  if (score <= 0) return null;
  const label = score >= 80 ? "Great match" : score >= 60 ? "Good match" : null;
  if (!label) return null;
  return (
    <span className={`${styles.scoreBadge} ${score >= 80 ? styles.scoreGreat : styles.scoreGood}`}>
      {label}
    </span>
  );
}

function MatchCard({ listing }: { listing: DiscoveryListing }) {
  const photoUrl = listing.coverImageUrl ?? null;
  const bgStyle = photoUrl
    ? { backgroundImage: `url(${photoUrl})` }
    : { background: CATEGORY_COLORS[listing.category] ?? DEFAULT_COLOR };

  const hasHousing = listing.benefits.housing.provision !== "not_provided";
  const hasMeals = listing.benefits.meals.provision !== "not_provided";
  const matchScore = listing.matchScore ?? 0;

  return (
    <Link href={`/listing/${listing.id}`} className={styles.card} aria-label={`${listing.title}, ${listing.location}`}>
      {/* Background */}
      <div className={styles.cardBg} style={bgStyle} aria-hidden="true" />
      <div className={styles.cardScrim} aria-hidden="true" />

      {/* Category badge */}
      <div className={styles.cardTop}>
        <span className={styles.categoryBadge}>
          <Icon name={`category.${listing.category}` as Parameters<typeof Icon>[0]["name"]} size={16} />
          {CATEGORY_LABEL[listing.category]}
        </span>
        {matchScore > 0 && <ScoreBadge score={matchScore} />}
      </div>

      {/* Content at bottom */}
      <div className={styles.cardBottom}>
        <h3 className={styles.cardTitle}>{listing.title}</h3>
        <p className={styles.cardLocation}>{listing.location}</p>

        <div className={styles.cardBenefits}>
          {hasHousing && (
            <span className={styles.benefit} title="Housing included" aria-label="Housing included">
              <Icon name="benefit.housing" size={16} />
            </span>
          )}
          {hasMeals && (
            <span className={styles.benefit} title="Meals included" aria-label="Meals included">
              <Icon name="benefit.meals" size={16} />
            </span>
          )}
          {listing.payInsight && formatPay(listing.payInsight) && (
            <span className={styles.payChip}>
              {formatPay(listing.payInsight)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>No matches yet</p>
      <p className={styles.emptyBody}>
        Complete your resume to unlock personalized matches.
      </p>
      <Link href="/resume" className={styles.emptyLink}>
        Build resume
      </Link>
    </div>
  );
}

export function MatchCardRail({ listings, title = "Matched for You" }: MatchCardRailProps) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {listings.length > 0 && (
          <Link href="/seek" className={styles.seeAll}>
            See all
            <Icon name="action.forward" size={16} />
          </Link>
        )}
      </div>

      {listings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={styles.rail} role="list">
          {listings.map((listing) => (
            <div key={listing.id} role="listitem">
              <MatchCard listing={listing} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
