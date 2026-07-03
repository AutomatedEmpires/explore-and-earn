import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Admin catch-all loading state. Shown for any (admin) route segment that does
 * not have its own loading.tsx — the marketplace-health dashboard plus the
 * listings / hosts / applications moderation tables (all service-role queries).
 * The admin header + sidebar stay rendered during the transition.
 *
 * Content-shaped, not a generic stat grid: a board hero, a 4-up MetricCard row,
 * then a few queue-card rows that mirror the real moderation surfaces so the
 * reveal lands without a layout jump.
 */
const METRIC_KEYS = ["metric-1", "metric-2", "metric-3", "metric-4"];
const ROW_KEYS = ["row-1", "row-2", "row-3", "row-4", "row-5"];

export default function AdminLoading() {
  return (
    <div className={styles.wrap} role="status" aria-busy="true">
      {/* Board hero — title + subtitle, mirroring the section heading. */}
      <div className={styles.hero}>
        <div className={styles.heroTitle}>
          <Skeleton variant="text" />
        </div>
        <div className={styles.heroSub}>
          <Skeleton variant="text" />
        </div>
      </div>

      {/* 4-up MetricCard-shaped row — label, big value, sparkline footprint. */}
      <div className={styles.metricGrid}>
        {METRIC_KEYS.map((key) => (
          <div key={key} className={styles.metric}>
            <div className={styles.metricTop}>
              <span className={styles.metricLabel}>
                <Skeleton variant="text" />
              </span>
              <span className={styles.metricPill}>
                <Skeleton variant="rect" />
              </span>
            </div>
            <span className={styles.metricValue}>
              <Skeleton variant="text" />
            </span>
            <span className={styles.metricSpark}>
              <Skeleton variant="rect" />
            </span>
          </div>
        ))}
      </div>

      {/* Queue rows — avatar + identity + meta + action, like the real cards. */}
      <ul className={styles.queue}>
        {ROW_KEYS.map((key) => (
          <li key={key} className={styles.row}>
            <span className={styles.avatar}>
              <Skeleton variant="circle" />
            </span>
            <span className={styles.identity}>
              <span className={styles.name}>
                <Skeleton variant="text" />
              </span>
              <span className={styles.sub}>
                <Skeleton variant="text" />
              </span>
            </span>
            <span className={styles.pill}>
              <Skeleton variant="rect" />
            </span>
            <span className={styles.button}>
              <Skeleton variant="rect" />
            </span>
          </li>
        ))}
      </ul>

      <span className={styles.srOnly}>Loading admin data</span>
    </div>
  );
}
