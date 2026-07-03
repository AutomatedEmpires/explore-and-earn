import Link from "next/link";

import { MetricCard, MetricGrid } from "@explore-and-earn/ui";

import styles from "./QuickStats.module.css";
import type { SeekerStatusSummary } from "./models";
import { RESUME_APPLY_THRESHOLD } from "./models";

export interface QuickStatsProps {
  readonly status: SeekerStatusSummary;
}

/**
 * Deterministic sparkline shaped toward `value` — a calm rising/settling curve,
 * never random. It is pure data-viz (no semantics, no icons), so the seven bars
 * read as momentum toward the headline number rather than decoration. The final
 * bar is always the tallest so MetricCard's lit last-bar lands on "today".
 */
function sparkToward(value: number, floor = 14): readonly number[] {
  const peak = Math.max(floor + 8, Math.min(100, Math.round(value)));
  const span = peak - floor;
  // Seven points easing up to the peak with a tiny mid-curve wobble for life.
  return [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const t = i / 6;
    const eased = t * t * (3 - 2 * t); // smoothstep
    const wobble = i > 0 && i < 6 ? Math.sin(i * 1.3) * 4 : 0;
    return Math.max(floor, Math.min(100, Math.round(floor + span * eased + wobble)));
  });
}

interface MetricLinkProps {
  readonly href: string;
  readonly label: string;
  readonly value: string;
  readonly trend: string;
  readonly trendTone: "up" | "down" | "neutral";
  readonly spark: readonly number[];
  readonly highlight?: boolean;
  readonly ariaLabel: string;
}

/** A MetricCard wrapped in a focusable link — keeps the tile tappable (≥44px). */
function MetricLink({
  href,
  label,
  value,
  trend,
  trendTone,
  spark,
  highlight,
  ariaLabel,
}: MetricLinkProps) {
  return (
    <Link
      href={href}
      className={`${styles.tile} ${highlight ? styles.tileHot : ""}`.trim()}
      aria-label={ariaLabel}
    >
      <MetricCard
        label={label}
        value={value}
        trend={trend}
        trendTone={trendTone}
        spark={spark}
      />
    </Link>
  );
}

/**
 * Seeker activity command strip — the benchmark `grid four` of metric cards
 * (Resume / Saved / Applied / Offers) with trend pills + animated sparklines,
 * built on the shared {@link MetricCard}/{@link MetricGrid} primitives so it
 * inherits the seeker OS emerald scope. Replaces the old flat chip row; reads as
 * metrics, not chips. Data comes only from `status` — no prop or query change.
 */
export function QuickStats({ status }: QuickStatsProps) {
  const resumeReady = status.resumeCompletion >= RESUME_APPLY_THRESHOLD;
  const hasApplied = status.appliedCount > 0;
  const hasOffers = status.offersCount > 0;
  const hasInbox = status.invitesCount > 0;

  return (
    <section className={styles.wrap} aria-label="Your activity">
      <MetricGrid className={styles.grid}>
      <MetricLink
        href="/resume"
        label="Resume"
        value={`${status.resumeCompletion}%`}
        trend={resumeReady ? "Ready" : "Improve"}
        trendTone={resumeReady ? "up" : "down"}
        spark={sparkToward(status.resumeCompletion)}
        highlight={!resumeReady && !hasOffers}
        ariaLabel={`Resume ${status.resumeCompletion}% complete${
          resumeReady ? ", ready to apply" : ", finish to unlock applying"
        }`}
      />
      <MetricLink
        href="/saved"
        label="Saved"
        value={String(status.savedCount)}
        trend={status.savedCount > 0 ? "Active" : "Browse"}
        trendTone={status.savedCount > 0 ? "neutral" : "down"}
        spark={sparkToward(Math.min(100, 30 + status.savedCount * 8))}
        ariaLabel={`${status.savedCount} saved opportunities`}
      />
      <MetricLink
        href="/applied"
        label="Applied"
        value={String(status.appliedCount)}
        trend={hasApplied ? "In review" : "Start"}
        trendTone={hasApplied ? "up" : "down"}
        spark={sparkToward(Math.min(100, 20 + status.appliedCount * 12))}
        ariaLabel={`${status.appliedCount} applications submitted`}
      />
      <MetricLink
        href="/offered"
        label="Offers"
        value={String(status.offersCount)}
        trend={hasOffers ? "Review" : "Pending"}
        trendTone={hasOffers ? "up" : "neutral"}
        spark={sparkToward(Math.min(100, 12 + status.offersCount * 24))}
        highlight={hasOffers}
        ariaLabel={`${status.offersCount} offers${
          hasOffers ? " awaiting your review" : ""
        }`}
      />
      {hasInbox ? (
        <MetricLink
          href="/invites"
          label="Invites"
          value={String(status.invitesCount)}
          trend="New"
          trendTone="up"
          spark={sparkToward(Math.min(100, 24 + status.invitesCount * 14))}
          highlight
          ariaLabel={`${status.invitesCount} pending host invites`}
        />
      ) : null}
      </MetricGrid>
    </section>
  );
}
