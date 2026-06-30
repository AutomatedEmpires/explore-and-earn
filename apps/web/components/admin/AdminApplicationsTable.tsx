"use client";

import { useMemo, useState } from "react";
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

/** Coarse triage lanes a moderator filters by. */
type Lane = "all" | "awaiting" | "decided";

const DECIDED_STATUSES = new Set(["accepted", "offered", "declined", "withdrawn"]);

/** A decided application has reached a terminal moderation outcome. */
function isDecided(status: string): boolean {
  return DECIDED_STATUSES.has(status);
}

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
    if (isDecided(a.status)) {
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

function MetricTile({
  label,
  value,
  trend,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly trend: string;
  readonly tone: "up" | "down" | "neutral";
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
    </article>
  );
}

/**
 * Admin moderation queue — recent applications as a premium review workbench.
 *
 * Local-only triage: a segment toolbar (All / Awaiting / Decided) plus a search
 * field filter the rows already on screen — no new query, no data contract
 * change. Read-only by contract: no application-mutation server action exists
 * yet, so the per-row Review affordance renders disabled with an explanatory
 * tooltip rather than a dead link. Raw Clerk user ids are NEVER shown to the eye
 * — only a derived display name, a short reference, and an initials avatar; the
 * id stays the React key.
 */
export function AdminApplicationsTable({
  applications,
}: {
  readonly applications: ReadonlyArray<AdminApplicationRowView>;
}) {
  const [lane, setLane] = useState<Lane>("all");
  const [query, setQuery] = useState("");

  const { total, inReview, decided, oldestDays } = useMemo(
    () => summarize(applications),
    [applications],
  );
  const oldestLabel =
    oldestDays <= 0 ? "Today" : oldestDays === 1 ? "1 day" : `${oldestDays} days`;

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return applications.filter((a) => {
      if (lane === "awaiting" && isDecided(a.status)) return false;
      if (lane === "decided" && !isDecided(a.status)) return false;
      if (trimmedQuery) {
        const who = applicantIdentity(a.seekerClerkUserId);
        const haystack =
          `${a.listingTitle} ${who.name} ${who.ref} ${humanizeToken(a.status)}`.toLowerCase();
        if (!haystack.includes(trimmedQuery)) return false;
      }
      return true;
    });
  }, [applications, lane, trimmedQuery]);

  const segments: ReadonlyArray<{ id: Lane; label: string; count: number }> = [
    { id: "all", label: "All", count: total },
    { id: "awaiting", label: "Awaiting", count: inReview },
    { id: "decided", label: "Decided", count: decided },
  ];

  const isFiltered = lane !== "all" || trimmedQuery.length > 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.metricGrid} role="presentation">
        <MetricTile label="In queue" value={String(total)} trend="Live" tone="neutral" />
        <MetricTile
          label="Awaiting review"
          value={String(inReview)}
          trend={inReview > 0 ? "Action" : "Clear"}
          tone={inReview > 0 ? "down" : "up"}
        />
        <MetricTile label="Decided" value={String(decided)} trend="Resolved" tone="up" />
        <MetricTile
          label="Oldest waiting"
          value={oldestLabel}
          trend={oldestDays >= 7 ? "Aging" : "Fresh"}
          tone={oldestDays >= 7 ? "down" : "up"}
        />
      </div>

      <div className={styles.toolbar}>
        <div
          className={styles.segments}
          role="tablist"
          aria-label="Filter applications by review status"
        >
          {segments.map((segment) => {
            const active = lane === segment.id;
            return (
              <button
                key={segment.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${styles.segment} ${active ? styles.segmentActive : ""}`.trim()}
                onClick={() => setLane(segment.id)}
              >
                <span className={styles.segmentLabel}>{segment.label}</span>
                <span className={styles.segmentCount}>{segment.count}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.search}>
          <span className={styles.searchIcon} aria-hidden="true">
            <Icon name="action.search" size={16} />
          </span>
          <input
            type="search"
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search seeker, listing, or status"
            aria-label="Search applications by seeker, listing, or status"
          />
        </div>
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
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyMarkNeutral} aria-hidden="true">
            <Icon name="action.search" size={24} />
          </span>
          <p className={styles.emptyTitle}>No matches in this view</p>
          <p className={styles.emptyHint}>
            No applications match the current filter. Widen the view to see the
            rest of the queue.
          </p>
          <Button
            variant="secondary"
            icon="action.close"
            onClick={() => {
              setLane("all");
              setQuery("");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <p className={styles.resultLine} role="status" aria-live="polite">
            {isFiltered ? (
              <>
                Showing <strong>{filtered.length}</strong> of {total}
              </>
            ) : (
              <>
                <strong>{total}</strong> applications
              </>
            )}
          </p>
          <ul className={styles.queue} aria-label="Recent applications review queue">
            {filtered.map((application) => {
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
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
