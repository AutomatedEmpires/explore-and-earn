import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import type { HostMessageThread } from "./models";
import styles from "./HostThreadView.module.css";

export interface HostThreadViewProps {
  readonly thread: HostMessageThread;
}

/**
 * Host message thread — the full conversation with one applicant. Renders the
 * transcript (host vs applicant) plus a presentational composer. UI-only: the
 * composer is read-only and Send is inert; messaging is not connected to any
 * backend (out of scope / founder-gated).
 */
export function HostThreadView({ thread }: HostThreadViewProps) {
  const messages = thread.messages ?? [];

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>{thread.applicantName}</span>
          <span className={styles.meta}>{thread.listingTitle}</span>
        </div>
        <Link className={styles.back} href="/host/messages">
          <Icon name="action.back" size={20} aria-hidden />
          <span>All messages</span>
        </Link>
      </header>

      {messages.length > 0 ? (
        <ol className={styles.transcript}>
          {messages.map((message) => {
            const fromHost = message.from === "host";
            return (
              <li
                key={message.id}
                className={
                  fromHost
                    ? `${styles.message} ${styles.messageHost}`
                    : styles.message
                }
              >
                <span className={styles.sender}>
                  {fromHost ? "You" : thread.applicantName}
                </span>
                <p className={styles.body}>{message.body}</p>
                <span className={styles.time}>{message.sentOn}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.hint}>No messages in this conversation yet.</p>
      )}

      <form
        className={styles.composer}
        aria-label={`Message ${thread.applicantName}`}
      >
        <textarea
          className={styles.input}
          rows={3}
          placeholder={`Message ${thread.applicantName}…`}
          aria-label={`Message ${thread.applicantName}`}
          readOnly
        />
        <div className={styles.composerActions}>
          <span className={styles.previewNote}>
            UI preview — messaging is not connected yet.
          </span>
          <button type="button" className={styles.send}>
            <Icon name="action.message" size={20} aria-hidden />
            <span>Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
