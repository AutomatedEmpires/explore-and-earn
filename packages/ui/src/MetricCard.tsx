import type { ReactNode } from "react";

import styles from "./MetricCard.module.css";

export interface MetricCardProps {
  /** Uppercase metric label, e.g. "Listing views". */
  readonly label: string;
  /** The headline value, e.g. "8.4k", "12.8%", "3.2h". */
  readonly value: ReactNode;
  /** Optional trend pill text, e.g. "↑ 24%", "Strong", "Fast". */
  readonly trend?: string;
  /** Pill tone: "up" (success), "down" (muted), "neutral" (accent). */
  readonly trendTone?: "up" | "down" | "neutral";
  /** Sparkline bar heights (0..100). Omit to hide the sparkline. */
  readonly spark?: readonly number[];
  readonly className?: string;
}

/**
 * The canonical dashboard metric tile — value + trend + animated sparkline.
 * Token-driven, so it themes itself per OS scope (host amber / seeker + admin
 * emerald) automatically. Compose with {@link MetricGrid} for the benchmark's
 * responsive "grid four" row.
 */
export function MetricCard({
  label,
  value,
  trend,
  trendTone = "neutral",
  spark,
  className,
}: MetricCardProps) {
  const tone =
    trendTone === "up" ? styles.trendUp : trendTone === "down" ? styles.trendDown : "";
  return (
    <article className={[styles.card, className].filter(Boolean).join(" ")}>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {trend ? <span className={`${styles.trend} ${tone}`.trim()}>{trend}</span> : null}
      </div>
      <div className={styles.value}>{value}</div>
      {spark && spark.length > 0 ? (
        <div className={styles.spark} aria-hidden="true">
          {spark.map((h, i) => (
            <i
              key={i}
              style={{
                height: `${Math.max(4, Math.min(100, h))}%`,
                animationDelay: `${i * 0.05}s`,
              }}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

/** Responsive metric row — the benchmark "grid four" wrapper. */
export function MetricGrid({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={[styles.grid, className].filter(Boolean).join(" ")}>{children}</div>
  );
}
