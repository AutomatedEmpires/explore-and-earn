import { Icon } from "@explore-and-earn/ui";

import { DEMO_APPLICANTS, DEMO_THREADS } from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * Applicant pipeline + message threads for the demo workspace.
 *
 * The production board (components/host/HostPipelineBoard) is bound to real
 * applications and status-transition server actions, so it cannot be fed a
 * fixture. This twin shows the same three things a host reads first: which
 * stage each applicant is in, the stored match score, and the signals behind
 * it. The names are invented and every card says so.
 */

const STAGE_CLASS: Record<"applied" | "reviewing" | "offered", string> = {
  offered: "stageOffered",
  reviewing: "stageReviewing",
  applied: "stagePill",
};

export function DemoApplicantPipeline({ id }: { readonly id?: string }) {
  return (
    <div className={styles.pipeline} id={id}>
      {DEMO_APPLICANTS.map((applicant) => (
        <article key={applicant.id} className={styles.applicant}>
          <div className={styles.applicantTop}>
            <h3 className={styles.applicantName}>{applicant.name}</h3>
            <span
              className={`${styles.stagePill} ${styles[STAGE_CLASS[applicant.stage]]}`}
            >
              {applicant.stageLabel}
            </span>
          </div>
          <p className={styles.applicantHeadline}>{applicant.headline}</p>
          <p className={styles.matchLine}>
            <Icon name="status.match" size={16} aria-hidden />
            Match score {applicant.matchScore} · {applicant.appliedLabel}
          </p>
          <div className={styles.signalRow}>
            {applicant.signals.map((signal) => (
              <span key={signal} className={styles.signal}>
                {signal}
              </span>
            ))}
          </div>
          <DemoLabel text={applicant.demoLabel} />
        </article>
      ))}
    </div>
  );
}

export function DemoThreadList({ id }: { readonly id?: string }) {
  return (
    <ul className={styles.threadList} id={id}>
      {DEMO_THREADS.map((thread) => (
        <li key={thread.id} className={styles.thread}>
          <div className={styles.threadTop}>
            <span className={styles.threadName}>
              {thread.unread ? (
                <>
                  <span className={styles.unreadDot} aria-hidden="true" />
                  <span className={styles.srOnly}>Unread. </span>
                </>
              ) : null}
              {thread.name}
            </span>
            <span className={styles.threadTime}>{thread.timeLabel}</span>
          </div>
          <p className={styles.threadPreview}>{thread.preview}</p>
          <DemoLabel text={thread.demoLabel} />
        </li>
      ))}
    </ul>
  );
}
