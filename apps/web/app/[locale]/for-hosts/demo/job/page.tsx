import {
  DEMO_APPLICANTS,
  DEMO_FLAGSHIP_ROLE,
  DemoDiscoverySources,
  DemoJobCard,
  DemoRoleDetail,
  DemoSurfaceHeader,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/** Demo workspace — the flagship opportunity, in full. */
export default function DemoJobPage() {
  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="job"
        eyebrow="Opportunity"
        title="The role, exactly as a seeker meets it"
        lede="The card below is the production DiscoveryCard — the same component Seek, Swipe and Map render. Housing, meals and pay are on its face, because that is what decides whether somebody can take the job."
      />

      <div className={styles.panel} id="tour-job-card">
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>The card</h2>
            <p className={styles.panelNote}>
              Tap anything on it — every control leads somewhere in this demo,
              because a fixture must not be able to reach a real drawer, a real
              route, or a moderation queue.
            </p>
          </div>
        </div>
        <DemoJobCard />
      </div>

      <DemoRoleDetail role={DEMO_FLAGSHIP_ROLE} applicants={DEMO_APPLICANTS} />

      <DemoDiscoverySources />
    </div>
  );
}
