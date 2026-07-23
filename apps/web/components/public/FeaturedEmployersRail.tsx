"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon, Skeleton } from "@explore-and-earn/ui";
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

/**
 * Above this count the curated row genuinely overflows a typical viewport, so
 * we switch from a static centered row to a manual scroll-snap carousel.
 * At or below it, every employer is shown at once — no scroll, no duplication.
 */
const STATIC_ROW_MAX = 4;

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
  return (
    <li className={styles.railItem} aria-hidden="true">
      <div className={styles.skeletonCard}>
        <div className={styles.skeletonImage}>
          <Skeleton variant="rect" />
        </div>
        <div className={styles.skeletonBody}>
          <div className={styles.skeletonLine} data-w="name">
            <Skeleton variant="text" />
          </div>
          <div className={styles.skeletonLine} data-w="meta">
            <Skeleton variant="text" />
          </div>
          <div className={styles.skeletonLine} data-w="chips">
            <Skeleton variant="text" />
          </div>
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
      aria-label={`${employer.hostName} — ${employer.location}${
        employer.isBoosted ? " (boosted)" : ""
      }`}
    >
      <div className={styles.imageSection}>
        <div className={`${styles.imageFrame} ${styles[`imageFrame_${employer.category}`]}`}>
          {employer.coverImageUrl ? (
            /* next/image: srcset via the Vercel optimizer — rail cards are a
               fixed 18rem (288px), so one small candidate serves them instead
               of the stored-resolution host upload (audit 2026-07-22). */
            <Image
              className={styles.image}
              src={employer.coverImageUrl}
              alt=""
              aria-hidden="true"
              fill
              loading="lazy"
              sizes="288px"
            />
          ) : null}
        </div>

        {/* Curated paid-placement marker — gold, paired with the verified mark.
            Reads as deliberate selection, not a per-card noise label. Canon:
            'featured' is archived; the only valid paid-visibility term is
            'boosted'. */}
        {employer.isBoosted ? (
          <span className={styles.featuredMark}>
            <Icon name="trust.featured_employer" size={16} aria-hidden />
            Boosted
          </span>
        ) : null}

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
        <p className={styles.location}>
          <span className={styles.locationDot} aria-hidden="true" />
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
  const isLoading = employers.length === 0;
  // A small curated set renders as a static, centered, evenly-spaced row.
  // Only when the set genuinely overflows do we become a manual scroll rail.
  const overflowing = employers.length > STATIC_ROW_MAX;
  const layout = isLoading ? "static" : overflowing ? "scroll" : "static";

  return (
    <section
      className={styles.section}
      aria-labelledby="featured-employers-heading"
    >
      <div className={styles.sectionHead}>
        <div className={styles.titleGroup}>
          <p className={styles.eyebrow}>Employers</p>
          <h2 id="featured-employers-heading" className={styles.sectionTitle}>
            <span className={styles.titleMark} aria-hidden="true">
              <Icon name="trust.featured_employer" size={20} aria-hidden />
            </span>
            Featured employers
          </h2>
        </div>
        <Link className={styles.viewAll} href="/seek">
          View all employers
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      </div>

      {/* Static centered row for a curated set; manual scroll-snap when it
          genuinely overflows. No auto-scroll, no duplicated inventory. */}
      <div className={styles.railOuter} data-layout={layout}>
        <ul className={styles.rail} data-layout={layout} role="list">
          {isLoading ? (
            <>
              <EmployerSkeleton />
              <EmployerSkeleton />
              <EmployerSkeleton />
            </>
          ) : (
            employers.map((employer, index) => (
              <li
                key={`${employer.hostName}-${employer.listingId}`}
                className={`${styles.railItem} ${styles.reveal}`}
                // Capped per-item stagger: the reveal cascade resets every 4
                // items so a long curated set never trails into slow sequencing.
                style={{ "--reveal-index": index % 4 } as CSSProperties}
              >
                <EmployerCard employer={employer} />
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
