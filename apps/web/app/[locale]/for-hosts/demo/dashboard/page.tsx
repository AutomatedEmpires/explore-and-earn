import Link from "next/link";

import { HostAnalyticsDashboard } from "../../../../../components/host/HostAnalyticsDashboard";
import {
  DEMO_ANALYTICS,
  DEMO_ANALYTICS_LABEL,
  DEMO_APPLICANTS,
  DemoDiscoverySources,
  DemoFunnel,
  DemoLabel,
  DemoMetricTiles,
  DemoRoleComparison,
  DemoSurfaceHeader,
  DemoTrendCharts,
  tallyByStage,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/**
 * Demo workspace — analytics (spec D25).
 *
 * The REAL HostAnalyticsDashboard renders here, fed an object DERIVED from the
 * application records rather than typed beside them. It takes a plain
 * HostAnalytics and nothing else, so there is no demo branch inside it and no
 * way for the demo to drift from what a paying host sees. Its scope is the
 * Enterprise plan's real analytics entitlement, read from the contract.
 *
 * THE ONE MAPPING WORTH STATING OUT LOUD. The stored status model has no
 * "interview" value — an interview is a booked event against an application
 * that is still in review — so the dashboard's Reviewing column contains the
 * pipeline's Reviewing AND Interview stages. The page says so in words, and a
 * unit test asserts the arithmetic, because a number that is explained is
 * evidence and a number that is not is a discrepancy.
 */
export default function DemoDashboardPage() {
  const tally = tallyByStage(DEMO_APPLICANTS);

  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="dashboard"
        eyebrow="Analytics"
        title="Numbers that name the role, not the mood"
        lede="Trends, funnel, discovery sources, and a role-by-role comparison with a plain-language diagnosis under each one. Every chart ships an accessible table beside it, because a bar described only by its shape withholds the content."
      />

      <DemoMetricTiles />

      <DemoTrendCharts id="tour-analytics-trends" />

      <DemoFunnel applicants={DEMO_APPLICANTS} />

      <DemoRoleComparison
        applicants={DEMO_APPLICANTS}
        id="tour-analytics-comparison"
      />

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Host analytics dashboard</h2>
            <p className={styles.panelNote}>
              Rendered by the same component your workspace uses. Its Reviewing
              column reads {tally.reviewing + tally.interview} because the stored
              status model has no separate value for an interview: it is{" "}
              {tally.reviewing} in review plus {tally.interview} with an
              interview booked.
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
        <Link className={styles.ghostCta} href="/for-hosts/demo/plan">
          Next: plan usage
        </Link>
      </div>
    </div>
  );
}
