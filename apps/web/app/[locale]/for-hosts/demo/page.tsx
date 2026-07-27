import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import {
  DEMO_ORG,
  DEMO_SURFACES,
  DemoMetricTiles,
  DemoPlanUsage,
  DemoSurfaceHeader,
} from "../../../../components/demo";
import styles from "../../../../components/demo/demoChrome.module.css";

/**
 * Demo workspace — overview.
 *
 * The landing surface a host would see after signing in, with the week's
 * numbers up front and a route into every other part of the workspace.
 */
export default function DemoOverviewPage() {
  const others = DEMO_SURFACES.filter((surface) => surface.id !== "overview");

  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="overview"
        id="tour-overview-head"
        eyebrow={`${DEMO_ORG.name} · ${DEMO_ORG.location}`}
        title="Your hosting workspace"
        lede="This is the Enterprise experience running on sample figures. Every surface below is the real product component, so what you see here is what you would be working in."
      />

      <DemoMetricTiles id="tour-overview-metrics" />

      <div className={styles.twoCol}>
        <DemoPlanUsage id="tour-plan-usage" />

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Walk the rest of it</h2>
          </div>
          <ul className={styles.usageList}>
            {others.map((surface) => (
              <li key={surface.id} className={styles.usageRow}>
                <Link className={styles.sourceName} href={surface.href}>
                  {surface.label}
                </Link>
                <span className={styles.usageNote}>{surface.summary}</span>
              </li>
            ))}
          </ul>
          <div className={styles.linkRow}>
            <Link className={styles.primaryCta} href="/sign-up?role=host">
              <Icon name="nav.host" size={18} aria-hidden />
              Build your host profile
            </Link>
            <Link className={styles.ghostCta} href="/for-hosts">
              Back to the host overview
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
