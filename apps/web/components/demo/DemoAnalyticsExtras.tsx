import Link from "next/link";
import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";
import { MetricCard, MetricGrid } from "@explore-and-earn/ui";

import {
  DEMO_ANALYTICS_LABEL,
  DEMO_DISCOVERY_SOURCES,
  DEMO_DRAFT_COUNT,
  DEMO_METRICS,
  DEMO_ORG,
  DEMO_PERFORMANCE_LABEL,
  DEMO_PLAN_USAGE,
} from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * The headline tiles, rendered by the REAL MetricCard / MetricGrid primitives
 * from @explore-and-earn/ui — the same tiles the host dashboard uses.
 *
 * `limit` exists so the acquisition page can show the first four without
 * duplicating the data or the label.
 */
export function DemoMetricTiles({
  id,
  limit,
}: {
  readonly id?: string;
  readonly limit?: number;
}) {
  const metrics =
    typeof limit === "number" ? DEMO_METRICS.slice(0, limit) : DEMO_METRICS;

  return (
    <div id={id}>
      <DemoLabel text={DEMO_PERFORMANCE_LABEL} />
      <MetricGrid>
        {metrics.map((metric) => (
          <MetricCard
            key={metric.id}
            label={metric.label}
            value={metric.value}
            trend={metric.trend}
            trendTone={metric.trendTone}
            spark={metric.spark}
          />
        ))}
      </MetricGrid>
    </div>
  );
}

/** Where the views came from — Seek, Swipe and Map are real seeker routes. */
export function DemoDiscoverySources({ id }: { readonly id?: string }) {
  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h3 className={styles.panelTitle}>Where seekers found you</h3>
          <p className={styles.panelNote}>
            Three discovery modes, one listing. A role that only works in one of
            them is a role with a gap.
          </p>
        </div>
        <DemoLabel text={DEMO_ANALYTICS_LABEL} />
      </div>
      <ul className={styles.sourceList}>
        {DEMO_DISCOVERY_SOURCES.map((source) => (
          <li key={source.id} className={styles.source}>
            <div className={styles.sourceTop}>
              <Link className={styles.sourceName} href={source.href}>
                {source.label}
              </Link>
              <span className={styles.sourceShare}>{source.share}</span>
            </div>
            <div
              className={styles.track}
              role="img"
              aria-label={`${source.label}: ${source.share} of opportunity views`}
            >
              <span
                className={styles.trackFill}
                style={{ "--fill": source.share } as React.CSSProperties}
              />
            </div>
            <span className={styles.sourceNote}>
              {source.views.toLocaleString()} views · {source.note}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Usage against the plan's allowance.
 *
 * The allowance NUMBER is read from PLAN_ENTITLEMENTS — the same contract the
 * server enforces — never typed here. A demo that quoted its own allowance
 * would be free to quote one the plan does not grant.
 */
export function DemoPlanUsage({ id }: { readonly id?: string }) {
  const entitlement = PLAN_ENTITLEMENTS[DEMO_ORG.planTier];

  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h3 className={styles.panelTitle}>
            {DEMO_ORG.planName} plan allowance
          </h3>
          <p className={styles.panelNote}>
            Counted against the plan, shown before you hit it.
          </p>
        </div>
        <DemoLabel text={DEMO_ANALYTICS_LABEL} />
      </div>
      <ul className={styles.usageList}>
        {DEMO_PLAN_USAGE.map((row) => {
          const included = entitlement[row.entitlementKey];
          const pct =
            included > 0
              ? `${Math.min(100, Math.round((row.used / included) * 100))}%`
              : "0%";
          return (
            <li key={row.id} className={styles.usageRow}>
              <span className={styles.usageTop}>
                <span>{row.label}</span>
                <span className={styles.usageCount}>
                  {row.used} of {included}
                </span>
              </span>
              <span
                className={styles.track}
                role="img"
                aria-label={`${row.label}: ${row.used} of ${included} used`}
              >
                <span
                  className={styles.trackFill}
                  style={{ "--fill": pct } as React.CSSProperties}
                />
              </span>
              <span className={styles.usageNote}>{row.note}</span>
            </li>
          );
        })}
      </ul>
      <p className={styles.panelNote}>
        {DEMO_DRAFT_COUNT} more roles sit in drafts. Drafts cost nothing and are
        not discoverable — publishing is what a plan buys.
      </p>
    </div>
  );
}
