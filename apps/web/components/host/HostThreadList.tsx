import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { EmptyState } from "../discovery";
import type { HostMessageThread } from "./models";
import styles from "./HostThreadList.module.css";

export interface HostThreadListProps {
  readonly threads: readonly HostMessageThread[];
}

export function HostThreadList({ threads }: HostThreadListProps) {
  if (threads.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        message="Conversations with applicants will show up here."
      />
    );
  }

  return (
    <ul className={styles.list}>
      {threads.map((thread) => (
        <li key={thread.id} className={styles.row}>
          <Link className={styles.item} href={`/host/messages/${thread.id}`}>
            <span className={styles.avatar} aria-hidden>
              <Icon name="action.message" size={20} aria-hidden />
            </span>
            <div className={styles.body}>
              <div className={styles.top}>
                <span className={styles.name}>{thread.applicantName}</span>
                <span className={styles.time}>{thread.updatedOn}</span>
              </div>
              <span className={styles.listing}>{thread.listingTitle}</span>
              <p className={styles.preview}>{thread.preview}</p>
            </div>
            {thread.unread ? <span className={styles.unread}>New</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
