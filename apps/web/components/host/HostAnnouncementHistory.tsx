import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";
import type { HostOwnAnnouncement } from "@explore-and-earn/db";

import { formatDate } from "../../lib/format";
import styles from "./HostAnnouncementHistory.module.css";

/**
 * The host's own announcement history (V2 §10).
 *
 * THE STATUS VOCABULARY IS THE DATABASE'S, TRANSLATED — NOT INVENTED. The
 * `host_announcements` table stores three values (`draft`, `active`,
 * `removed`) and an `expires_at`, and that is the whole state machine. A run
 * that is `active` with a past `expires_at` is finished, which is why "Finished"
 * is derived here rather than stored; there is no `published_at` and there is
 * NO `scheduled_at`, so this list cannot and does not show a scheduled run.
 *
 * A `draft` row is not a half-written announcement. It is a PAID run whose
 * content has not been supplied — the Stripe webhook creates it — which is why
 * its row is a call to action rather than a neutral state pill.
 */

type DerivedStatus = "awaiting" | "live" | "finished" | "removed";

const STATUS_LABEL: Record<DerivedStatus, string> = {
  awaiting: "Paid — awaiting content",
  live: "Live",
  finished: "Finished",
  removed: "Removed",
};

const KIND_LABEL: Record<string, string> = {
  general: "General",
  hiring: "Now hiring",
  event: "Event",
};

/** The stored status plus the clock. Both are needed; neither alone suffices. */
export function deriveAnnouncementStatus(
  announcement: Pick<HostOwnAnnouncement, "status" | "expiresAt">,
  nowMs: number,
): DerivedStatus {
  if (announcement.status === "removed") return "removed";
  if (announcement.status === "draft") return "awaiting";
  const expires = new Date(announcement.expiresAt).getTime();
  if (Number.isNaN(expires)) return "live";
  return expires > nowMs ? "live" : "finished";
}

function formatDay(iso: string): string {
  if (Number.isNaN(new Date(iso).getTime())) return "";
  return formatDate(iso, { month: "short", day: "numeric", year: "numeric" });
}

export interface HostAnnouncementHistoryProps {
  readonly announcements: readonly HostOwnAnnouncement[];
  /** Injected so the render is deterministic under test. */
  readonly nowMs?: number;
}

export function HostAnnouncementHistory({
  announcements,
  nowMs = Date.now(),
}: HostAnnouncementHistoryProps) {
  if (announcements.length === 0) {
    return (
      <div className={styles.empty}>
        <h3 className={styles.emptyTitle}>Nothing published yet</h3>
        <p className={styles.emptyBody}>
          Your announcements appear here once you publish one, with its run
          dates and whether it came from your plan allowance or a single
          purchase.
        </p>
        <Link className={styles.emptyLink} href="/for-hosts/demo/announcements">
          <Icon name="system.info" size={16} aria-hidden />
          See a worked example in the demo workspace
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {announcements.map((announcement) => {
        const status = deriveAnnouncementStatus(announcement, nowMs);
        return (
          <li key={announcement.id} className={styles.item}>
            <div className={styles.top}>
              <span className={styles.statusPill} data-status={status}>
                {STATUS_LABEL[status]}
              </span>
              <h3 className={styles.title}>
                {announcement.title.trim().length > 0
                  ? announcement.title
                  : "Untitled — add your content to publish this run"}
              </h3>
            </div>

            {announcement.body.trim().length > 0 ? (
              <p className={styles.body}>{announcement.body}</p>
            ) : null}

            <div className={styles.meta}>
              <span>{KIND_LABEL[announcement.kind] ?? announcement.kind}</span>
              <span>
                {announcement.isPurchased
                  ? "Single purchased run"
                  : "Included in your plan"}
              </span>
              <span>Created {formatDay(announcement.createdAt)}</span>
              <span>
                {status === "finished" ? "Ended " : "Runs until "}
                {formatDay(announcement.expiresAt)}
              </span>
            </div>

            {/*
              D23 / honesty rules: no impression or click data is recorded for
              announcements anywhere in this product — no counter column, no
              events table, nothing. So the row says that, and shows no chart.
              An "estimated reach" here would be a number with no source.
            */}
            <p className={styles.noMetrics}>
              No delivery or engagement figures — nothing about announcement
              reach is measured yet.
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The performance panel, in the only state the data supports.
 *
 * §10 asks for a performance panel IF impression/click data exists. It does
 * not: `host_announcements` carries no counters, there is no announcement
 * events table, and the two announcement names in the event taxonomy
 * (`host_announcement_created`, `host_announcement_viewed`) have no call site.
 * So this panel states the gap and charts nothing, rather than plotting a row
 * of zeroes that would read as "nobody saw it".
 */
export function HostAnnouncementPerformance() {
  return (
    <div className={styles.performance}>
      <h3 className={styles.performanceTitle}>Performance</h3>
      <p className={styles.performanceBody}>
        Metrics arrive when tracking ships. Announcement views, opens and
        attributed applications are not recorded anywhere in the product today,
        so there is nothing to chart — and a chart drawn from nothing would be
        worse than this sentence.
      </p>
      <p className={styles.performanceBody}>
        Reactions and comments left on a published announcement are visible in
        the community feed where it runs.
      </p>
      <Link className={styles.performanceLink} href="/community">
        <Icon name="action.forward" size={16} aria-hidden />
        Open the community feed
      </Link>
    </div>
  );
}
