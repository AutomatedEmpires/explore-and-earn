import Link from "next/link";

import {
  DEMO_OUTREACH,
  DemoOutreachWorkspace,
  DemoSurfaceHeader,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/** Demo workspace — outreach campaigns, credits, and response performance. */
export default function DemoOutreachPage() {
  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="outreach"
        eyebrow="Outreach"
        title="Go and get the seeker you want"
        lede={`When nobody has applied yet you are not stuck waiting. Search seekers by availability and by the benefits they need, then spend an invite credit to put your role in front of one. ${DEMO_OUTREACH.accepted} of ${DEMO_OUTREACH.sent} invitations were accepted this season.`}
      />

      <DemoOutreachWorkspace id="tour-outreach-campaigns" />

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts/demo/messages">
          Next: messages
        </Link>
      </div>
    </div>
  );
}
