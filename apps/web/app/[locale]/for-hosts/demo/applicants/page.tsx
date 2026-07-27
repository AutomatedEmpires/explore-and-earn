import Link from "next/link";
import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

import {
  DEMO_ORG,
  DemoApplicantPipeline,
  DemoSurfaceHeader,
  DemoThreadList,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/** Demo workspace — applicants, invites and messaging. */
export default function DemoApplicantsPage() {
  const inviteCredits =
    PLAN_ENTITLEMENTS[DEMO_ORG.planTier].includedInviteCredits;

  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="applicants"
        eyebrow="Applicants"
        title="A season of applications, as a decision"
        lede="Stages, stored match scores, and the signals behind them. The message thread sits beside the application, so the answer to a question stays attached to the person who asked it."
      />

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Pipeline</h2>
            <p className={styles.panelNote}>
              New, reviewing, offered — with the score that was computed when the
              application was made, not recomputed to flatter the card.
            </p>
          </div>
        </div>
        <DemoApplicantPipeline id="tour-pipeline" />
      </div>

      <div className={styles.twoCol}>
        <div className={styles.panel} id="tour-invites">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Invite seekers directly</h2>
          </div>
          <p className={styles.panelNote}>
            When nobody has applied yet you are not stuck waiting. Search seekers
            by availability and by the benefits they need, then spend an invite
            credit to put your role in front of one. The{" "}
            {DEMO_ORG.planName} plan includes {inviteCredits} invites a month,
            and credit packs extend beyond the monthly allowance.
          </p>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Messages</h2>
          </div>
          <DemoThreadList id="tour-threads" />
        </div>
      </div>

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts/demo/announcements">
          Next: announcements
        </Link>
      </div>
    </div>
  );
}
