import Link from "next/link";

import {
  DemoDiscoverySources,
  DemoJobCard,
  DemoJobDetailPreview,
  DemoSurfaceHeader,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/** Demo workspace — the opportunity, as a seeker meets it. */
export default function DemoJobPage() {
  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="job"
        eyebrow="Opportunity"
        title="The role, exactly as a seeker meets it"
        lede="The card below is the production DiscoveryCard — the same component Seek, Swipe and Map render. Housing, meals and pay are on its face, because that is what decides whether someone can take the job."
      />

      <div className={styles.panel} id="tour-job-card">
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>The card</h2>
            <p className={styles.panelNote}>
              Tap anything on it — every control leads somewhere in this demo.
            </p>
          </div>
        </div>
        <DemoJobCard />
      </div>

      <DemoJobDetailPreview triadId="tour-job-triad" matchId="tour-job-match" />

      <DemoDiscoverySources />

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/seek">
          See real roles in Seek
        </Link>
      </div>
    </div>
  );
}
