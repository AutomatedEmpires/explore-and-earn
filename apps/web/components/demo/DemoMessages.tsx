"use client";

import { useState } from "react";
import { Icon } from "@explore-and-earn/ui";

import {
  DEMO_DATA_LABEL,
  DEMO_STAGE_LABEL,
  DEMO_THREADS,
  demoApplicant,
  demoRole,
  unreadThreadCount,
} from "./enterpriseDemo";
import { useDemoSession } from "./DemoSession";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * The message workspace: thread list, conversation, and a context rail.
 *
 * THE RAIL IS THE POINT. Every thread joins to a real application record, so
 * the panel beside the conversation carries the candidate's current stage,
 * availability, certifications and housing need — read live from the session's
 * applicant list, which means moving somebody in the pipeline updates the rail
 * here too. That is the product claim ("the answer stays attached to the person
 * who asked") demonstrated rather than asserted.
 *
 * THE COMPOSER IS A PREVIEW, NOT A FORM. Nothing in this demo may send
 * anything, so the composer renders as a disabled preview with a plain
 * statement of why. A demo that appeared to send a message and silently did
 * nothing would be worse than one that does not offer the button.
 */
export function DemoMessageWorkspace({ id }: { readonly id?: string }) {
  const session = useDemoSession();
  const [activeId, setActiveId] = useState(DEMO_THREADS[0].id);
  const thread =
    DEMO_THREADS.find((entry) => entry.id === activeId) ?? DEMO_THREADS[0];
  const canonApplicant = demoApplicant(thread.applicantId);
  const applicant =
    session.applicants.find((entry) => entry.id === thread.applicantId) ??
    canonApplicant;
  const unread = unreadThreadCount();

  return (
    <div className={styles.messageLayout} id={id}>
      <section className={styles.panel} aria-label="Threads">
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Threads</h2>
            <p className={styles.panelNote}>
              {unread} unread of {DEMO_THREADS.length}
            </p>
          </div>
        </div>
        <div className={styles.conversation}>
          {DEMO_THREADS.map((entry) => {
            const person = demoApplicant(entry.applicantId);
            const last = entry.messages[entry.messages.length - 1];
            return (
              <button
                key={entry.id}
                type="button"
                className={styles.threadButton}
                aria-current={entry.id === thread.id}
                onClick={() => setActiveId(entry.id)}
              >
                <span className={styles.threadTop}>
                  <span className={styles.threadName}>
                    {entry.unread ? (
                      <>
                        <span className={styles.unreadDot} aria-hidden="true" />
                        <span className={styles.srOnly}>Unread. </span>
                      </>
                    ) : null}
                    {person ? person.name : entry.subject}
                  </span>
                  <span className={styles.threadTime}>
                    {entry.lastActivityLabel}
                  </span>
                </span>
                <span className={styles.threadPreview}>
                  {entry.subject} — {last ? last.body : ""}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.panel} aria-label="Conversation">
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>{thread.subject}</h2>
            <p className={styles.panelNote}>
              {applicant ? applicant.name : "Candidate"} ·{" "}
              {applicant ? demoRole(applicant.roleId).title : ""}
            </p>
          </div>
          <DemoLabel text={thread.demoLabel} />
        </div>

        <div className={styles.conversation}>
          {thread.messages.map((message) => (
            <p
              key={message.id}
              className={`${styles.bubble} ${
                message.from === "host" ? styles.bubbleHost : styles.bubbleApplicant
              }`}
            >
              {message.body}
              <span className={styles.bubbleTime}>
                {message.from === "host" ? "You" : applicant?.name} ·{" "}
                {message.timeLabel}
              </span>
            </p>
          ))}
        </div>

        <div className={styles.composerPreview}>
          <p className={styles.calloutTitle}>Reply</p>
          <p className={styles.composerField}>
            Type a reply to {applicant ? applicant.name : "this candidate"}…
          </p>
          <p className={styles.calloutBody}>
            Composing is disabled in the demo. Nothing on these pages sends an
            email, a message or a notification to anybody — this is a preview of
            the workspace, not a copy of it wired to a real inbox.
          </p>
          <DemoLabel text={DEMO_DATA_LABEL} />
        </div>
      </section>

      <section className={styles.panel} aria-label="Candidate context">
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Context</h2>
        </div>
        {applicant ? (
          <>
            <div className={styles.detailHead}>
              <span className={`${styles.avatar} ${styles.avatarLarge}`} aria-hidden="true">
                {applicant.initials}
              </span>
              <div>
                <p className={styles.candidateName}>{applicant.name}</p>
                <p className={styles.candidateMeta}>{applicant.location}</p>
              </div>
            </div>
            <ul className={styles.checkList}>
              <li className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <Icon name="status.applied" size={16} aria-hidden />
                </span>
                Stage: {DEMO_STAGE_LABEL[applicant.stage]}
              </li>
              <li className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <Icon name="status.match" size={16} aria-hidden />
                </span>
                Match score {applicant.matchScore}, stored with the application
              </li>
              <li className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <Icon name="status.begins" size={16} aria-hidden />
                </span>
                Available {applicant.availability}
              </li>
              <li className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <Icon name="benefit.housing" size={16} aria-hidden />
                </span>
                {applicant.needsHousing
                  ? "Needs the staff cabin"
                  : "Local — no housing needed"}
              </li>
              <li className={styles.checkItem}>
                <span className={styles.checkIcon}>
                  <Icon name="profile.verification" size={16} aria-hidden />
                </span>
                {applicant.certifications.length > 0
                  ? applicant.certifications.join(", ")
                  : "No certifications recorded"}
              </li>
            </ul>
            <p className={styles.panelNote}>{applicant.note}</p>
            <DemoLabel text={applicant.demoLabel} />
          </>
        ) : null}
      </section>
    </div>
  );
}
