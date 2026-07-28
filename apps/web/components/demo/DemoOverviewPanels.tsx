import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import {
  DEMO_ANALYTICS_LABEL,
  DEMO_DATA_LABEL,
  DEMO_TODAY_LABEL,
  deriveCalendar,
  deriveNeedsAttention,
  demoApplicant,
  DEMO_THREADS,
  unreadThreadCount,
  type DemoApplicant,
} from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * Overview panels: Needs Attention, the season calendar, and communications.
 *
 * EVERY ITEM CARRIES ITS EVIDENCE. The founder's complaint about the V1
 * overview was that it diagnosed nothing; the fix is not more panels but a rule
 * — an item may appear here only if a predicate over the records produced it,
 * and it must render the record that did. "Improve engagement" cannot be
 * written in this component, because there is nothing to attach it to.
 */

export function DemoNeedsAttention({
  applicants,
  id,
}: {
  readonly applicants: readonly DemoApplicant[];
  readonly id?: string;
}) {
  const items = deriveNeedsAttention(applicants);

  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Needs attention</h2>
          <p className={styles.panelNote}>
            {DEMO_TODAY_LABEL}. Each line is produced by a rule over your own
            records and shows the record that produced it.
          </p>
        </div>
        <DemoLabel text={DEMO_ANALYTICS_LABEL} />
      </div>
      <ul className={styles.attentionList}>
        {items.map((item) => (
          <li
            key={item.id}
            className={styles.attentionItem}
            data-tone={item.tone}
          >
            <span className={styles.attentionTitle}>{item.title}</span>
            <span className={styles.attentionEvidence}>{item.evidence}</span>
            <Link className={styles.attentionLink} href={item.href}>
              Open the surface that fixes it
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DemoSeasonCalendar({
  applicants,
  id,
}: {
  readonly applicants: readonly DemoApplicant[];
  readonly id?: string;
}) {
  const entries = deriveCalendar(applicants);

  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>The season ahead</h2>
          <p className={styles.panelNote}>
            Deadlines, the interview block, and the scheduled announcement —
            read off the roles and runs themselves.
          </p>
        </div>
        <DemoLabel text={DEMO_DATA_LABEL} />
      </div>
      <ul className={styles.calendarList}>
        {entries.map((entry) => (
          <li key={entry.id} className={styles.calendarRow} data-tone={entry.tone}>
            <span className={styles.calendarDate}>{entry.date}</span>
            <span>
              <span className={styles.calendarTitle}>{entry.title}</span>
              <span className={styles.calendarDetail}>{entry.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DemoCommunications({ id }: { readonly id?: string }) {
  const unread = unreadThreadCount();

  return (
    <div className={styles.panel} id={id}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Communications</h2>
          <p className={styles.panelNote}>
            {unread} of {DEMO_THREADS.length} threads are unread. Every thread is
            attached to an application, never a loose contact.
          </p>
        </div>
        <DemoLabel text={DEMO_DATA_LABEL} />
      </div>
      <ul className={styles.threadList}>
        {DEMO_THREADS.slice(0, 4).map((thread) => {
          const applicant = demoApplicant(thread.applicantId);
          const last = thread.messages[thread.messages.length - 1];
          return (
            <li key={thread.id} className={styles.thread}>
              <div className={styles.threadTop}>
                <span className={styles.threadName}>
                  {thread.unread ? (
                    <>
                      <span className={styles.unreadDot} aria-hidden="true" />
                      <span className={styles.srOnly}>Unread. </span>
                    </>
                  ) : null}
                  {applicant ? applicant.name : thread.subject}
                </span>
                <span className={styles.threadTime}>
                  {thread.lastActivityLabel}
                </span>
              </div>
              <p className={styles.threadPreview}>{last ? last.body : ""}</p>
            </li>
          );
        })}
      </ul>
      <div className={styles.linkRow}>
        <Link className={styles.ghostCta} href="/for-hosts/demo/messages">
          <Icon name="nav.messages" size={16} aria-hidden />
          Open messages
        </Link>
      </div>
    </div>
  );
}
