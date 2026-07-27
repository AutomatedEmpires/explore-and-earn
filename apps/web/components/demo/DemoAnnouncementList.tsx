import { DEMO_ANNOUNCEMENTS, type DemoAnnouncementStatus } from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * The announcement list for the demo workspace.
 *
 * The production composer (components/host/HostAnnouncementComposer) is a form
 * bound to server actions and a live monthly quota, so it cannot render from a
 * fixture; there is no read-only list component to reuse either. This is the
 * presentational twin of what a host's announcement history looks like.
 *
 * A DRAFT AND A SCHEDULED RUN CARRY NO ENGAGEMENT FIGURES, and that is the
 * point: numbers appear only against announcements that actually ran. Inventing
 * "expected reach" for something that has not been sent is the exact class of
 * claim the honesty rules forbid.
 */

const STATUS_CLASS: Record<DemoAnnouncementStatus, string> = {
  published: "statusPublished",
  scheduled: "statusScheduled",
  draft: "statusDraft",
};

const STATUS_LABEL: Record<DemoAnnouncementStatus, string> = {
  published: "Published",
  scheduled: "Scheduled",
  draft: "Draft",
};

const KIND_LABEL: Record<"general" | "hiring" | "event", string> = {
  general: "General",
  hiring: "Now hiring",
  event: "Event",
};

export function DemoAnnouncementList({ id }: { readonly id?: string }) {
  return (
    <ul className={styles.announceList} id={id}>
      {DEMO_ANNOUNCEMENTS.map((announcement) => (
        <li key={announcement.id} className={styles.announce}>
          <div className={styles.announceTop}>
            <span
              className={`${styles.statusPill} ${styles[STATUS_CLASS[announcement.status]]}`}
            >
              {STATUS_LABEL[announcement.status]}
            </span>
            <h3 className={styles.announceTitle}>{announcement.title}</h3>
            <DemoLabel text={announcement.demoLabel} />
          </div>
          <p className={styles.announceBody}>{announcement.body}</p>
          <div className={styles.announceMeta}>
            <span>{KIND_LABEL[announcement.kind]}</span>
            <span>Audience: {announcement.audience}</span>
            <span>
              {announcement.dateLabel}
              {announcement.date ? ` ${announcement.date}` : ""}
            </span>
          </div>
          {announcement.engagement ? (
            <div className={styles.engagementRow}>
              <span className={styles.engagementItem}>
                <span className={styles.engagementValue}>
                  {announcement.engagement.views.toLocaleString()}
                </span>
                <span className={styles.engagementLabel}>Views</span>
              </span>
              <span className={styles.engagementItem}>
                <span className={styles.engagementValue}>
                  {announcement.engagement.opens.toLocaleString()}
                </span>
                <span className={styles.engagementLabel}>Opened</span>
              </span>
              <span className={styles.engagementItem}>
                <span className={styles.engagementValue}>
                  {announcement.engagement.saves.toLocaleString()}
                </span>
                <span className={styles.engagementLabel}>Roles saved after</span>
              </span>
            </div>
          ) : (
            <p className={styles.noEngagement}>
              No results yet — this one has not run.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
