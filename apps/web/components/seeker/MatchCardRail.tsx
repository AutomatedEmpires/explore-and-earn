"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import type { IconKey } from "@explore-and-earn/ui";
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

/**
 * Honest "why this matched" reason chip, derived purely from the listing's own
 * query-layer fields — never a fabricated score. Each reason is a real, present
 * provision/attribute the seeker can verify on the listing.
 */
interface Reason {
  readonly key: string;
  readonly icon: IconKey;
  readonly label: string;
}

/**
 * Compose up to three honest reasons from the listing itself. Order = priority:
 * the triad (housing / meals / pay) leads because it is the product's promise,
 * then verified-host trust, then the timeline. We never imply a personalised
 * score here — these are facts, not a model output.
 */
function deriveReasons(listing: DiscoveryListing): readonly Reason[] {
  const reasons: Reason[] = [];

  const housing = listing.benefits.housing.provision;
  if (housing !== "not_provided") {
    reasons.push({
      key: "housing",
      icon: "benefit.housing",
      label: housing === "partial" ? "Housing help" : "Housing provided",
    });
  }

  const meals = listing.benefits.meals.provision;
  if (meals !== "not_provided") {
    reasons.push({
      key: "meals",
      icon: "benefit.meals",
      label: meals === "partial" ? "Some meals" : "Meals provided",
    });
  }

  const payLabel = formatPay(listing.payInsight);
  if (payLabel) {
    reasons.push({ key: "pay", icon: "benefit.pay", label: payLabel });
  } else if (listing.benefits.pay.provision !== "not_provided") {
    reasons.push({ key: "pay", icon: "benefit.pay", label: "Paid role" });
  }

  if (listing.host.verified) {
    reasons.push({ key: "verified", icon: "trust.verified_host", label: "Verified host" });
  }

  if (reasons.length < 3 && listing.opportunityWindow) {
    reasons.push({
      key: "window",
      icon: "status.begins",
      label: listing.opportunityWindow,
    });
  }

  return reasons.slice(0, 3);
}

/**
 * Score band — ONLY rendered when matchScore is genuinely set by the query
 * layer (never implies a fake 0). The band reads as a relevance qualifier, not
 * a hard percentage we don't trust.
 */
function ScoreBand({ score }: { score: number }) {
  const tier = score >= 80 ? "high" : score >= 60 ? "mid" : "base";
  const label = score >= 80 ? "Strong match" : score >= 60 ? "Good match" : "Match";
  return (
    <span className={`${styles.scoreBand} ${styles[`score-${tier}`]}`}>
      <Icon name="status.match" size={16} />
      {label}
    </span>
  );
}

function MatchCard({ listing }: { listing: DiscoveryListing }) {
  const photoUrl = listing.coverImageUrl ?? null;
  const bgStyle = photoUrl
    ? { backgroundImage: `url(${photoUrl})` }
    : { background: CATEGORY_COLORS[listing.category] ?? DEFAULT_COLOR };

  const reasons = deriveReasons(listing);
  const hasScore = listing.matchScore != null && listing.matchScore > 0;

  return (
    <Link
      href={`/listing/${listing.id}`}
      className={styles.card}
      aria-label={`${listing.title}, ${listing.location}`}
    >
      {/* Background */}
      <div className={styles.cardBg} style={bgStyle} aria-hidden="true" />
      <div className={styles.cardScrim} aria-hidden="true" />

      {/* Top: category lane + (honest) score band */}
      <div className={styles.cardTop}>
        <span className={styles.categoryBadge}>
          <Icon name={`category.${listing.category}` as IconKey} size={16} />
          {CATEGORY_LABEL[listing.category]}
        </span>
        {hasScore && <ScoreBand score={listing.matchScore as number} />}
      </div>

      {/* Bottom: title, location, why-it-matched reasons */}
      <div className={styles.cardBottom}>
        <h3 className={styles.cardTitle}>{listing.title}</h3>
        <p className={styles.cardLocation}>
          <Icon name="mappin.location" size={16} aria-hidden />
          <span className={styles.cardLocationText}>{listing.location}</span>
        </p>

        {reasons.length > 0 && (
          <ul className={styles.reasonStrip} aria-label="Why this matches you">
            {reasons.map((reason) => (
              <li
                key={reason.key}
                className={`${styles.reason} ${styles[`reason-${reason.key}`] ?? ""}`}
              >
                <Icon name={reason.icon} size={16} aria-hidden />
                <span className={styles.reasonText}>{reason.label}</span>
              </li>
            ))}
          </ul>
        )}
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
          {listings.map((listing, index) => (
            <div
              key={listing.id}
              role="listitem"
              className={styles.railItem}
              style={{ "--i": index } as CSSProperties}
            >
              <MatchCard listing={listing} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
