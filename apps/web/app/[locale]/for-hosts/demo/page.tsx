import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import {
  DEMO_ORG,
  DemoMetricTiles,
  DemoOrgIdentity,
  DemoOverviewLive,
  DemoPlanUsage,
  DemoSurfaceHeader,
  DemoWeatherPanel,
} from "../../../../components/demo";
import styles from "../../../../components/demo/demoChrome.module.css";

/**
 * Demo workspace — the recruiting command centre (spec D24).
 *
 * Identity band with real photography, sample-labelled weather, the hiring
 * pulse, a Needs Attention queue whose every line carries its evidence, the
 * pipeline funnel, rich per-role performance cards with computed diagnoses, the
 * season calendar, communications, and plan usage. Nothing on this page is a
 * placeholder and nothing on it is empty.
 */
export default function DemoOverviewPage() {
  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="overview"
        id="tour-overview-head"
        eyebrow={`${DEMO_ORG.name} · ${DEMO_ORG.location}`}
        title="Your hosting workspace, mid-season"
        lede="This is the Enterprise experience running on sample records: seven roles, ninety-six applications, five outreach campaigns and a season with three weeks left on the clock. Every figure below is computed from those records, which is why they agree with each other."
      />

      <DemoOrgIdentity id="tour-profile-identity" />

      <DemoMetricTiles id="tour-overview-metrics" />

      <DemoOverviewLive />

      <div className={styles.twoCol}>
        <DemoWeatherPanel />
        <DemoPlanUsage id="tour-plan-usage-overview" />
      </div>

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          <Icon name="nav.host" size={18} aria-hidden />
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts/demo/listings">
          Next: the roles
        </Link>
      </div>
    </div>
  );
}
