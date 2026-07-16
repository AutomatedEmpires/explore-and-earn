import Link from "next/link";

import { MetricCard, MetricGrid } from "@explore-and-earn/ui";

import styles from "./QuickStats.module.css";
import type { SeekerStatusSummary } from "./models";
import { RESUME_APPLY_THRESHOLD } from "./models";

export interface QuickStatsProps {
  readonly status: SeekerStatusSummary;
}

interface MetricLinkProps {
  readonly href: string;
  readonly label: string;
  readonly value: string;
  readonly trend: string;
  readonly trendTone: "up" | "down" | "neutral";
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
      />
    </Link>
  );
}

/**
 * Seeker activity command strip — the benchmark `grid four` of metric cards
 * (Resume / Saved / Applied / Offers) with trend pills,
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
        ariaLabel={`${status.savedCount} saved opportunities`}
      />
      <MetricLink
        href="/applied"
        label="Applied"
        value={String(status.appliedCount)}
        trend={hasApplied ? "In review" : "Start"}
        trendTone={hasApplied ? "up" : "down"}
        ariaLabel={`${status.appliedCount} applications submitted`}
      />
      <MetricLink
        href="/offered"
        label="Offers"
        value={String(status.offersCount)}
        trend={hasOffers ? "Review" : "Pending"}
        trendTone={hasOffers ? "up" : "neutral"}
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
          highlight
          ariaLabel={`${status.invitesCount} pending host invites`}
        />
      ) : null}
      </MetricGrid>
    </section>
  );
}
