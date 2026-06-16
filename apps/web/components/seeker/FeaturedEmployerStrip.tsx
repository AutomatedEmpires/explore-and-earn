"use client";

import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";
import styles from "./FeaturedEmployerStrip.module.css";

// Tokenized category atmospheres (shared across all seeker surfaces).
const CATEGORY_GRADIENTS: Record<string, string> = {
  maritime: "var(--gradient-category-maritime)",
  farm:     "var(--gradient-category-farm)",
  remote:   "var(--gradient-category-remote)",
  seasonal: "var(--gradient-category-seasonal)",
  mix:      "var(--gradient-category-mix)",
};

function EmployerCard({ employer }: { employer: FeaturedEmployer }) {
  const bgStyle = employer.coverImageUrl
    ? { backgroundImage: `url(${employer.coverImageUrl})` }
    : { background: CATEGORY_GRADIENTS[employer.category] ?? CATEGORY_GRADIENTS.mix };

  const initials = employer.hostName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <Link
      href={`/listing/${employer.listingId}`}
      className={styles.card}
      aria-label={`${employer.hostName} — ${employer.listingCount} opening${employer.listingCount !== 1 ? "s" : ""}`}
    >
      <div className={styles.cardBg} style={bgStyle} aria-hidden="true" />
      <div className={styles.cardScrim} aria-hidden="true" />
      <div className={styles.cardContent}>
        <div className={styles.logoChip}>{initials}</div>
        <div className={styles.cardMeta}>
          <span className={styles.hostName}>{employer.hostName}</span>
          <span className={styles.openingCount}>
            {employer.listingCount} opening{employer.listingCount !== 1 ? "s" : ""}
          </span>
        </div>
        {employer.verified && (
          <span className={styles.verifiedBadge} aria-label="Verified host">
            <Icon name="status.match" size={16} />
          </span>
        )}
      </div>
    </Link>
  );
}

export interface FeaturedEmployerStripProps {
  readonly employers: readonly FeaturedEmployer[];
}

export function FeaturedEmployerStrip({ employers }: FeaturedEmployerStripProps) {
  if (employers.length === 0) return null;

  return (
    <section className={styles.section} aria-label="Featured employers">
      <div className={styles.header}>
        <h2 className={styles.title}>Featured Employers</h2>
        <Link href="/seek" className={styles.seeAll}>
          Browse
          <Icon name="action.forward" size={16} />
        </Link>
      </div>
      <div className={styles.rail} role="list">
        {employers.map((emp) => (
          <div key={emp.hostId ?? emp.hostName} role="listitem">
            <EmployerCard employer={emp} />
          </div>
        ))}
      </div>
    </section>
  );
}
