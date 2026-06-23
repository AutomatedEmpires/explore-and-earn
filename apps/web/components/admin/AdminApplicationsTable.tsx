import type { ReactNode } from "react";
import { Badge, type BadgeProps, Button, Icon, type IconKey } from "@explore-and-earn/ui";

import { formatAdminDate, humanizeToken } from "./status";
import styles from "./AdminApplicationsTable.module.css";

export interface AdminApplicationRowView {
  readonly id: string;
  readonly seekerClerkUserId: string;
  readonly listingTitle: string;
  readonly status: string;
  readonly createdAt: string;
}

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/** Map an application status token to a Badge variant + queue lane. */
function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "accepted":
    case "offered":
      return "success";
    case "applied":
    case "open":
      return "info";
    case "match":
      return "match";
    case "declined":
    case "withdrawn":
      return "neutral";
    default:
      return "neutral";
  }
}

/** Map an application status to its registry icon key. */
function statusIcon(status: string): IconKey {
  switch (status) {
    case "accepted":
      return "status.accepted";
    case "offered":
      return "status.offered";
    case "declined":
      return "status.declined";
    case "withdrawn":
      return "status.withdrawn";
    case "match":
      return "status.match";
    default:
      return "status.applied";
  }
}

/**
 * Derive a human applicant label from a Clerk user id WITHOUT ever showing the
 * raw id to the eye. We surface a stable short reference (last 4 of the id) so
 * a moderator can correlate, plus initials for the avatar — the full id stays a
 * key/link target only, never rendered as a column.
 */
function applicantIdentity(clerkId: string): {
  readonly name: string;
  readonly ref: string;
  readonly initials: string;
} {
  const trimmed = clerkId.trim();
  if (!trimmed) {
    return { name: "Unknown seeker", ref: "—", initials: "?" };
  }
  const tail = trimmed.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  const ref = tail ? `#${tail}` : "—";
  // Two-letter avatar mark from the reference — deterministic, never the id.
  const initials = (tail.slice(0, 2) || "SK").toUpperCase();
  return { name: `Seeker ${ref}`, ref, initials };
}

/** A short, human "age" string from an ISO timestamp (queue triage signal). */
function appliedAge(iso: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Count applications per coarse lane for the command metric row. */
function summarize(applications: ReadonlyArray<AdminApplicationRowView>) {
  let inReview = 0;
  let decided = 0;
  let oldestDays = 0;
  for (const a of applications) {
    if (a.status === "accepted" || a.status === "offered" || a.status === "declined" || a.status === "withdrawn") {
      decided += 1;
    } else {
      inReview += 1;
    }
    const t = new Date(a.createdAt).getTime();
    if (!Number.isNaN(t)) {
      const days = Math.floor((Date.now() - t) / 86_400_000);
      if (days > oldestDays) oldestDays = days;
    }
  }
  return { total: applications.length, inReview, decided, oldestDays };
}

/** Deterministic spark heights derived from a seed — pure data-viz, no icons. */
function spark(seed: number, n = 7): readonly number[] {
  const out: number[] = [];
  let x = seed * 2654435761;
  for (let i = 0; i < n; i += 1) {
    x = (x ^ (x >>> 15)) >>> 0;
    out.push(28 + (x % 70));
  }
  return out;
}

function MetricTile({
  label,
  value,
  trend,
  tone,
  seed,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly trend: string;
  readonly tone: "up" | "down" | "neutral";
  readonly seed: number;
}) {
  const trendClass =
    tone === "up" ? styles.trendUp : tone === "down" ? styles.trendDown : styles.trendNeutral;
  return (
    <article className={styles.metric}>
      <div className={styles.metricTop}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={`${styles.trend} ${trendClass}`}>{trend}</span>
      </div>
      <div className={styles.metricValue}>{value}</div>
      <div className={styles.spark} aria-hidden="true">
        {spark(seed).map((h, i) => (
          <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 0.05}s` }} />
        ))}
      </div>
    </article>
  );
}

/**
 * Admin moderation queue — recent applications as a premium review workbench.
 *
 * Read-only by contract (observation only): no application-mutation server
 * action exists yet, so the per-row Review affordance renders disabled with an
 * explanatory tooltip rather than a dead link. Raw Clerk user ids are NEVER
 * shown to the eye — only a derived display name, a short reference, and an
 * initials avatar; the id stays the React key.
 */
export function AdminApplicationsTable({
  applications,
}: {
  readonly applications: ReadonlyArray<AdminApplicationRowView>;
}) {
  const { total, inReview, decided, oldestDays } = summarize(applications);
  const oldestLabel =
    oldestDays <= 0 ? "Today" : oldestDays === 1 ? "1 day" : `${oldestDays} days`;

  return (
    <div className={styles.wrap}>
      <div className={styles.metricGrid} role="presentation">
        <MetricTile
          label="In queue"
          value={total}
          trend="Live"
          tone="neutral"
          seed={total + 3}
        />
        <MetricTile
          label="Awaiting review"
          value={inReview}
          trend={inReview > 0 ? "Action" : "Clear"}
          tone={inReview > 0 ? "down" : "up"}
          seed={inReview + 7}
        />
        <MetricTile
          label="Decided"
          value={decided}
          trend="Resolved"
          tone="up"
          seed={decided + 11}
        />
        <MetricTile
          label="Oldest waiting"
          value={oldestLabel}
          trend={oldestDays >= 7 ? "Aging" : "Fresh"}
          tone={oldestDays >= 7 ? "down" : "up"}
          seed={oldestDays + 5}
        />
      </div>

      {applications.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyMark} aria-hidden="true">
            <Icon name="status.accepted" size={24} />
          </span>
          <p className={styles.emptyTitle}>Queue clear</p>
          <p className={styles.emptyHint}>
            Nothing is waiting on review. New applications land here the moment a
            seeker applies.
          </p>
        </div>
      ) : (
        <ul className={styles.queue} aria-label="Recent applications review queue">
          {applications.map((application) => {
            const who = applicantIdentity(application.seekerClerkUserId);
            const isAging =
              !Number.isNaN(new Date(application.createdAt).getTime()) &&
              Date.now() - new Date(application.createdAt).getTime() > 7 * 86_400_000;
            return (
              <li key={application.id} className={styles.row}>
                <span className={styles.avatar} aria-hidden="true">
                  {who.initials}
                </span>

                <div className={styles.identity}>
                  <span className={styles.name}>{who.name}</span>
                  <span className={styles.sub}>
                    Applied to{" "}
                    <span className={styles.listing}>
                      {application.listingTitle || "Untitled listing"}
                    </span>
                  </span>
                </div>

                <div className={styles.meta}>
                  <Badge
                    label={humanizeToken(application.status)}
                    variant={statusVariant(application.status)}
                    icon={statusIcon(application.status)}
                  />
                  <span
                    className={`${styles.age} ${isAging ? styles.ageHot : ""}`.trim()}
                  >
                    <Icon name="status.begins" size={16} aria-hidden />
                    <span>{appliedAge(application.createdAt)}</span>
                    <span className={styles.date}>
                      {formatAdminDate(application.createdAt)}
                    </span>
                  </span>
                </div>

                <div className={styles.action}>
                  <Button
                    variant="secondary"
                    icon="action.view"
                    disabled
                    title="Review actions arrive with the moderation workbench"
                    aria-label={`Review the application from ${who.name} (coming soon)`}
                  >
                    Review
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
