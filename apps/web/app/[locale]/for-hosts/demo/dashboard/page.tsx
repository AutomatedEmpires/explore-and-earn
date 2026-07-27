import Link from "next/link";

import { HostAnalyticsDashboard } from "../../../../../components/host/HostAnalyticsDashboard";
import {
  DEMO_ANALYTICS,
  DEMO_ANALYTICS_LABEL,
  DemoDiscoverySources,
  DemoLabel,
  DemoMetricTiles,
  DemoSurfaceHeader,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/**
 * Demo workspace — analytics.
 *
 * The REAL HostAnalyticsDashboard renders here, fed the fixture. It takes a
 * plain HostAnalytics object and nothing else, so there is no demo branch
 * inside it and no risk of the demo drifting from what a paying host sees. The
 * fixture declares `analyticsScope: "full"` because that is the Enterprise
 * plan's real entitlement — the per-listing section below is the paid depth,
 * shown at the depth the plan actually grants.
 */
export default function DemoDashboardPage() {
  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="dashboard"
        eyebrow="Analytics"
        title="The numbers that tell you what to change"
        lede="This is the production analytics dashboard, fed with sample figures. Account-wide performance on every plan; the per-listing diagnosis is the paid depth."
      />

      <DemoMetricTiles />

      <div className={styles.panel} id="tour-analytics">
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Host analytics dashboard</h2>
            <p className={styles.panelNote}>
              Rendered by the same component your workspace uses — the figures
              below are the only thing that is sample data.
            </p>
          </div>
          <DemoLabel text={DEMO_ANALYTICS_LABEL} />
        </div>
        <div id="tour-analytics-listings">
          <HostAnalyticsDashboard analytics={DEMO_ANALYTICS} />
        </div>
      </div>

      <DemoDiscoverySources />

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts#plans">
          See the plans
        </Link>
      </div>
    </div>
  );
}
