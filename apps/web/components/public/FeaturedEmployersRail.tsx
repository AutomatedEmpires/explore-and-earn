"use client";

import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";
import type { OpportunityCategory } from "@explore-and-earn/contracts";

import styles from "./FeaturedEmployersRail.module.css";

export interface FeaturedEmployer {
  readonly hostName: string;
  readonly hostId?: string;
  readonly listingId: string;
  readonly location: string;
  readonly listingCount: number;
  readonly verified: boolean;
  readonly tagline?: string;
  readonly coverImageUrl?: string;
  readonly category: OpportunityCategory;
  /** True when this employer holds an active paid featured campaign. */
  readonly isBoosted?: boolean;
}

const CATEGORY_ABBR: Record<OpportunityCategory, string> = {
  farm:     "FARM",
  maritime: "SEA",
  remote:   "REMOTE",
  seasonal: "SEASONAL",
  mix:      "MIX",
};

function EmployerBadge({
  name,
  category,
}: {
  name: string;
  category: OpportunityCategory;
}) {
  const words = name.trim().split(/\s+/);
  const initials = words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();

  return (
    <div
      className={`${styles.badge} ${styles[`badge_${category}`]}`}
      aria-hidden="true"
    >
      <span className={styles.badgeMark}>{initials}</span>
      <span className={styles.badgeRule} />
      <span className={styles.badgeLabel}>{CATEGORY_ABBR[category]}</span>
    </div>
  );
}

function EmployerSkeleton() {
  const slab = {
    background: "rgba(0,0,0,0.07)",
    borderRadius: "4px",
  } as const;

  return (
    <li className={styles.railItem} aria-hidden="true">
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          width: "18rem",
          minWidth: "264px",
          border: "1.5px solid rgba(25,21,14,0.12)",
          borderRadius: "var(--radius-card)",
          background: "var(--color-card-warm, #faf8f4)",
          overflow: "hidden",
        }}
      >
        {/* image placeholder */}
        <div style={{ height: "160px", background: "rgba(0,0,0,0.06)" }} />
        {/* text rows */}
        <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ ...slab, height: "14px", width: "60%" }} />
          <div style={{ ...slab, height: "12px", width: "80%" }} />
          <div style={{ ...slab, height: "11px", width: "40%" }} />
        </div>
      </div>
    </li>
  );
}

function EmployerCard({ employer }: { employer: FeaturedEmployer }) {
  const href = employer.hostId
    ? `/host/${employer.hostId}`
    : `/listing/${employer.listingId}`;

  return (
    <Link
      className={`${styles.card} ${styles[`card_${employer.category}`]}`}
      href={href}
      aria-label={`${employer.hostName} — ${employer.location}`}
    >
      <div className={styles.imageSection}>
        <div className={`${styles.imageFrame} ${styles[`imageFrame_${employer.category}`]}`}>
          {employer.coverImageUrl ? (
            <img
              className={styles.image}
              src={employer.coverImageUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
            />
          ) : null}
        </div>
        <EmployerBadge name={employer.hostName} category={employer.category} />
      </div>

      <div className={styles.body}>
        <div className={styles.nameRow}>
          <span className={styles.employerName}>{employer.hostName}</span>
          {employer.verified && (
            <span className={styles.verifiedIcon} aria-label="Verified host">
              <Icon name="trust.verified_host" size={16} aria-hidden />
            </span>
          )}
        </div>
        {employer.isBoosted ? (
          <span className={styles.featuredBadge} aria-label="Featured employer">Featured</span>
        ) : null}
        <p className={styles.location}>
          <span className={styles.locationDot} aria-hidden="true">●</span>
          {employer.location}
        </p>
        <div className={styles.chips}>
          <span className={styles.chip}>
            <Icon name="status.open" size={16} aria-hidden />
            {employer.listingCount}&thinsp;listing{employer.listingCount === 1 ? "" : "s"}
          </span>
          <span className={`${styles.chip} ${styles.chipHiring}`}>
            <span className={styles.hiringDot} aria-hidden="true" />
            Hiring now
          </span>
        </div>
        {employer.tagline ? <p className={styles.tagline}>{employer.tagline}</p> : null}
      </div>
    </Link>
  );
}

export function FeaturedEmployersRail({
  employers,
}: {
  employers: readonly FeaturedEmployer[];
}) {
  return (
    <section
      className={styles.section}
      aria-labelledby="featured-employers-heading"
    >
      <div className={styles.sectionHead}>
        <div className={styles.titleGroup}>
          <p className={styles.eyebrow}>Employers</p>
          <h2 id="featured-employers-heading" className={styles.sectionTitle}>
            Featured employers
            <span className={styles.sparkle} aria-hidden="true">✦</span>
          </h2>
        </div>
        <Link className={styles.viewAll} href="/seek">
          View all employers
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      </div>

      {/* ── Rail — auto-scrolls, loops seamlessly ────────────────────── */}
      <div className={styles.railOuter}>
        <ul className={styles.rail} role="list">
          {employers.length === 0 ? (
            <>
              <EmployerSkeleton />
              <EmployerSkeleton />
              <EmployerSkeleton />
            </>
          ) : (
            <>
              {/* Primary items — interactive */}
              {employers.map((employer) => (
                <li key={`${employer.hostName}-${employer.listingId}`} className={styles.railItem}>
                  <EmployerCard employer={employer} />
                </li>
              ))}
              {/* Duplicate items — decorative, for seamless loop */}
              {employers.map((employer) => (
                <li key={`${employer.hostName}-${employer.listingId}-2`} className={styles.railItem} aria-hidden="true">
                  <EmployerCard employer={employer} />
                </li>
              ))}
            </>
          )}
        </ul>
      </div>
    </section>
  );
}
