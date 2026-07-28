import Link from "next/link";

import {
  DEMO_APPLICANTS,
  DEMO_LIVE_ROLES,
  DEMO_QUALIFIED_MATCHES,
  DemoApplicantWorkspace,
  DemoSurfaceHeader,
  QUALIFIED_MATCH_THRESHOLD,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/** Demo workspace — the applicant pipeline, the list, and the detail view. */
export default function DemoApplicantsPage() {
  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="applicants"
        eyebrow="Applicants"
        title="A season of applications, as a decision"
        lede={`All ${DEMO_APPLICANTS.length} applications across ${DEMO_LIVE_ROLES.length} live roles, each carrying the match score computed when it was made. Open anyone, move them between stages, and watch every total on the page move with them.`}
      />

      <div className={styles.callout}>
        <p className={styles.calloutTitle}>
          {DEMO_QUALIFIED_MATCHES} of {DEMO_APPLICANTS.length} applications
          score {QUALIFIED_MATCH_THRESHOLD} or above
        </p>
        <p className={styles.calloutBody}>
          That figure is not stored anywhere — it is a count of the applications
          on this page whose score clears the threshold. Every other number here
          works the same way, which is why the pipeline, the funnel and the
          analytics dashboard cannot disagree about the same season.
        </p>
      </div>

      <DemoApplicantWorkspace id="tour-pipeline" />

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts/demo/outreach">
          Next: outreach
        </Link>
      </div>
    </div>
  );
}
