import { EmptyState } from "../discovery";
import { HostThreadList } from "./HostThreadList";
import type { HostMessageThread } from "./models";
import styles from "./HostThreadGroups.module.css";

export interface HostThreadGroupsProps {
  readonly threads: readonly HostMessageThread[];
}

/**
 * Messages grouped by read state. Partitions threads into Unread then Read
 * sections, each with a live count, so a host triages unread conversations
 * first. Reuses the canonical HostThreadList for each group (empty groups are
 * omitted). Presentation only — grouping is a pure view concern; no thread is
 * mutated and nothing touches a backend.
 */
export function HostThreadGroups({ threads }: HostThreadGroupsProps) {
  if (threads.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        message="Conversations with applicants will show up here."
      />
    );
  }

  const groups: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly items: readonly HostMessageThread[];
  }> = [
    { key: "unread", label: "Unread", items: threads.filter((t) => t.unread) },
    { key: "read", label: "Read", items: threads.filter((t) => !t.unread) },
  ];

  return (
    <div className={styles.groups}>
      {groups.map((group) =>
        group.items.length > 0 ? (
          <section
            key={group.key}
            className={styles.group}
            aria-label={group.label}
          >
            <header className={styles.head}>
              <h3 className={styles.title}>{group.label}</h3>
              <span className={styles.count}>{group.items.length}</span>
            </header>
            <HostThreadList threads={group.items} />
          </section>
        ) : null,
      )}
    </div>
  );
}
