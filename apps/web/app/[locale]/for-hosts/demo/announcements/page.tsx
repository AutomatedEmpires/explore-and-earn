import Link from "next/link";
import {
  ANNOUNCEMENT_PRICE_CENTS,
  ANNOUNCEMENT_RUN_DAYS,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";

import { formatMoney } from "../../../../../lib/format";
import {
  DEMO_ORG,
  DemoAnnouncementComposerPreview,
  DemoAnnouncementList,
  DemoAnnouncementPerformance,
  DemoSurfaceHeader,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/** Demo workspace — announcements: composer preview, history, and one result. */
export default function DemoAnnouncementsPage() {
  const monthly = PLAN_ENTITLEMENTS[DEMO_ORG.planTier].monthlyAnnouncements;

  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="announcements"
        eyebrow="Announcements"
        title="Reach seekers who have not found your listing yet"
        lede="A hiring push, a housing update, a closing date. Announcements go out across the marketplace, which is how a season opens with a queue instead of a silence."
      />

      <div className={styles.callout}>
        <p className={styles.calloutTitle}>How the allowance works</p>
        <p className={styles.calloutBody}>
          The {DEMO_ORG.planName} plan includes {monthly} announcement runs a
          month. Beyond the allowance, a single {ANNOUNCEMENT_RUN_DAYS}-day run
          is {formatMoney(ANNOUNCEMENT_PRICE_CENTS)} — one flat price, no
          duration options to weigh up.
        </p>
      </div>

      <DemoAnnouncementComposerPreview />

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>This season&rsquo;s announcements</h2>
            <p className={styles.panelNote}>
              Drafts and scheduled runs carry no engagement figures. Numbers
              appear only against announcements that actually went out.
            </p>
          </div>
        </div>
        <DemoAnnouncementList id="tour-announcement-list" />
      </div>

      <DemoAnnouncementPerformance />

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts/demo/dashboard">
          Next: analytics
        </Link>
      </div>
    </div>
  );
}
