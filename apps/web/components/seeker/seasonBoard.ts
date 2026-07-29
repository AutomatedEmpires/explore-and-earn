import type { ApplicationWithListing } from "@explore-and-earn/db";

import { formatDate } from "../../lib/format";
import type { DiscoveryListing } from "../discovery";
import type { SeekerStatusSummary } from "./models";

/**
 * Season board — the composed, honest state of a seeker's season, and the pure
 * builders that turn it into the dashboard's written lede, deadline queue and
 * season line.
 *
 * HONESTY CONTRACT (every builder in this file obeys it):
 *   - A sentence, a queue row or a timeline mark exists ONLY when the row
 *     behind it carries a real timestamp. No date → no claim.
 *   - "Host began review" comes from applications.reviewed_at, never inferred.
 *   - Nothing here computes a match score or invents urgency: "urgent" is a
 *     date within three days, by arithmetic alone.
 *
 * Everything below is pure and deterministic (clock injected) so the lede and
 * queue are unit-testable without a database.
 */

/* ────────────────────────────── board types ─────────────────────────────── */

export interface SeasonThread {
  readonly id: string;
  /** Display name of the other party (host/listing), best-effort. */
  readonly withName: string;
  /** ISO timestamp of the latest message in the thread, or null. */
  readonly lastMessageAt: string | null;
}

export interface SeasonInvite {
  readonly id: string;
  readonly listingId: string | null;
  readonly listingTitle: string | null;
  readonly location: string | null;
  readonly expiresAt: string | null;
}

export interface WatchedListing {
  readonly listing: DiscoveryListing;
  /** listings.expires_at — when this role stops taking applications. */
  readonly closesAt: string | null;
}

export interface SeasonBoard {
  readonly status: SeekerStatusSummary;
  /** applications.status = offered, newest first, listing join included. */
  readonly offers: readonly ApplicationWithListing[];
  /** applied / reviewing rows — the in-motion list. */
  readonly inMotion: readonly ApplicationWithListing[];
  /** not_selected / withdrawn rows — shown quietly, most recent first. */
  readonly closedRecent: readonly ApplicationWithListing[];
  /** accepted rows — the committed season. */
  readonly accepted: readonly ApplicationWithListing[];
  readonly invites: readonly SeasonInvite[];
  /** Saved listings, nearest close-date first. */
  readonly watching: readonly WatchedListing[];
  readonly threads: readonly SeasonThread[];
  readonly matches: readonly DiscoveryListing[];
}

/* ───────────────────────────── time helpers ─────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntil(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / DAY_MS);
}

/** "Mon, Aug 3" — deadline phrasing used across the queue and the lede. */
export function formatDayDate(iso: string): string {
  return formatDate(iso, { weekday: "short", month: "short", day: "numeric" });
}

/** Weekday word for the lede ("Monday"), only meaningful within ~6 days. */
function weekdayWord(iso: string): string {
  return formatDate(iso, { weekday: "long" });
}

/** "2h ago" / "yesterday" / "Jul 23" — recency for movement lines. */
export function relativeRecency(
  iso: string | null | undefined,
  now: Date,
): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = now.getTime() - t;
  if (diff < 0) return null;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(iso, { month: "short", day: "numeric" });
}

/* ─────────────────────────────── the lede ───────────────────────────────── */

export interface Lede {
  /** The authored sentence: "Two things need you this week: …" */
  readonly sentence: string;
  /** A calmer second line, or null when the sentence already says it all. */
  readonly aside: string | null;
  /** How many clauses made the sentence (0 = quiet day). */
  readonly clauseCount: number;
}

const COUNT_WORD = ["Nothing", "One thing", "Two things", "Three things"] as const;

interface LedeClause {
  readonly when: number; // ms — for ordering
  readonly text: string;
}

/**
 * Compose the dashboard's written lede from real state. Clauses are gathered in
 * deadline order and capped at three — the sentence must stay a sentence.
 * Priority is time, not category: whatever is due first is named first.
 */
export function composeLede(board: SeasonBoard, now: Date): Lede {
  const clauses: LedeClause[] = [];

  for (const offer of board.offers) {
    if (!offer.expiresAt || !offer.listing) continue;
    const days = daysUntil(offer.expiresAt, now);
    if (days == null || days < 0) continue;
    const when = Date.parse(offer.expiresAt);
    const dayWord =
      days <= 6 ? weekdayWord(offer.expiresAt) : formatDayDate(offer.expiresAt);
    clauses.push({
      when,
      text: `your ${offer.listing.host.name !== "Unknown Host" ? `${offer.listing.host.name} ` : ""}offer for ${offer.listing.title} expires ${dayWord}`,
    });
  }

  for (const watched of board.watching) {
    const days = daysUntil(watched.closesAt, now);
    if (watched.closesAt == null || days == null || days < 0 || days > 7) continue;
    clauses.push({
      when: Date.parse(watched.closesAt),
      text: `${watched.listing.host.name} closes applications ${weekdayWord(watched.closesAt)}`,
    });
  }

  for (const invite of board.invites) {
    const days = daysUntil(invite.expiresAt, now);
    if (invite.expiresAt == null || days == null || days < 0 || days > 7) continue;
    clauses.push({
      when: Date.parse(invite.expiresAt),
      text: `an invitation${invite.listingTitle ? ` for ${invite.listingTitle}` : ""} holds until ${weekdayWord(invite.expiresAt)}`,
    });
  }

  const recentThreads = board.threads.filter((thread) => {
    const t = thread.lastMessageAt ? Date.parse(thread.lastMessageAt) : NaN;
    return !Number.isNaN(t) && now.getTime() - t < 3 * DAY_MS;
  });
  if (recentThreads.length === 1) {
    clauses.push({
      when: Date.parse(recentThreads[0].lastMessageAt as string),
      text: `${recentThreads[0].withName} wrote back`,
    });
  } else if (recentThreads.length > 1) {
    clauses.push({
      when: Math.min(
        ...recentThreads.map((thread) => Date.parse(thread.lastMessageAt as string)),
      ),
      text: `${recentThreads.length} hosts wrote back`,
    });
  }

  clauses.sort((a, b) => a.when - b.when);
  const kept = clauses.slice(0, 3);

  // An offer whose listing or expiry cannot be read is still an offer — the
  // sentence claims exactly what the rows prove: that one is waiting.
  if (kept.length === 0 && board.offers.length > 0) {
    return {
      sentence:
        board.offers.length === 1
          ? "An offer is on the table — review it before anything else."
          : `${board.offers.length} offers are on the table — review them before anything else.`,
      aside: null,
      clauseCount: 1,
    };
  }

  if (kept.length === 0) {
    const moving = board.inMotion.length;
    const watchingCount = board.status.savedCount;
    const parts: string[] = [];
    if (moving > 0) {
      parts.push(
        moving === 1 ? "one application is moving" : `${moving} applications are moving`,
      );
    }
    if (watchingCount > 0) {
      parts.push(
        watchingCount === 1
          ? "one saved role is waiting"
          : `${watchingCount} saved roles are waiting`,
      );
    }
    return {
      sentence:
        parts.length > 0
          ? `Nothing needs you today — ${parts.join(", and ")}.`
          : "Nothing needs you today. The season is yours to start.",
      aside: null,
      clauseCount: 0,
    };
  }

  const opener = COUNT_WORD[kept.length];
  const verb = kept.length === 1 ? "needs" : "need";
  const body =
    kept.length === 1
      ? kept[0].text
      : kept.length === 2
        ? `${kept[0].text}, and ${kept[1].text}`
        : `${kept[0].text}, ${kept[1].text}, and ${kept[2].text}`;
  const overflow = clauses.length - kept.length;

  return {
    sentence: `${opener} ${verb} you this week: ${body}.`,
    aside:
      overflow > 0
        ? `${overflow} more ${overflow === 1 ? "item" : "items"} can wait — they're in your week below.`
        : null,
    clauseCount: kept.length,
  };
}

/* ─────────────────────────────── the week ───────────────────────────────── */

export interface WeekRow {
  readonly key: string;
  /** "TODAY" / "SAT" — the day column's word. */
  readonly dayLabel: string;
  /** "Jul 29" — the day column's date. */
  readonly dateLabel: string;
  /** Due within 3 days (or already due today). */
  readonly urgent: boolean;
  readonly title: string;
  readonly sub: string;
  readonly ctaLabel: string;
  readonly ctaHref: string;
  /** True for the single most consequential row (styled as primary). */
  readonly primary: boolean;
}

/**
 * The deadline-ordered week: offers, closing saved roles, invite expiries and
 * fresh replies, capped at four rows. Only rows with real timestamps qualify;
 * replies (no deadline) sort first as "today".
 */
export function buildWeekQueue(board: SeasonBoard, now: Date): WeekRow[] {
  interface Candidate extends Omit<WeekRow, "dayLabel" | "dateLabel" | "urgent"> {
    readonly when: number;
    readonly deadline: string | null;
  }
  const candidates: Candidate[] = [];

  const freshThreads = board.threads.filter((thread) => {
    const t = thread.lastMessageAt ? Date.parse(thread.lastMessageAt) : NaN;
    return !Number.isNaN(t) && now.getTime() - t < 3 * DAY_MS;
  });
  if (freshThreads.length > 0) {
    const newest = freshThreads[0];
    candidates.push({
      key: "replies",
      when: now.getTime(),
      deadline: null,
      title:
        freshThreads.length === 1
          ? `Reply to ${newest.withName}`
          : `Reply to ${freshThreads.length} hosts`,
      sub:
        freshThreads.length === 1
          ? `wrote ${relativeRecency(newest.lastMessageAt, now) ?? "recently"}`
          : `newest ${relativeRecency(newest.lastMessageAt, now) ?? "recently"}`,
      ctaLabel: "Reply",
      ctaHref: "/messages",
      primary: false,
    });
  }

  for (const watched of board.watching) {
    const days = daysUntil(watched.closesAt, now);
    if (watched.closesAt == null || days == null || days < 0 || days > 14) continue;
    candidates.push({
      key: `closes-${watched.listing.id}`,
      when: Date.parse(watched.closesAt),
      deadline: watched.closesAt,
      title: `${watched.listing.title} closes to applicants`,
      sub: `${watched.listing.host.name} · ${watched.listing.location} · a role you saved`,
      ctaLabel: "Apply",
      ctaHref: `/listing/${watched.listing.id}`,
      primary: false,
    });
  }

  for (const offer of board.offers) {
    const days = daysUntil(offer.expiresAt, now);
    if (offer.expiresAt != null && (days == null || days < 0)) continue;
    // An offer with no readable expiry or listing still queues — as due now,
    // titled with only what the row proves.
    candidates.push({
      key: `offer-${offer.id}`,
      when: offer.expiresAt ? Date.parse(offer.expiresAt) : now.getTime(),
      deadline: offer.expiresAt,
      title: offer.listing
        ? `Decide on your ${offer.listing.title} offer`
        : "Decide on the offer waiting for you",
      sub: offer.listing
        ? `${offer.listing.location} · ${offer.listing.benefits.pay.summary}`
        : "Open it to see the role, pay and housing",
      ctaLabel: "Review offer",
      ctaHref: "/offered",
      primary: true,
    });
  }

  for (const invite of board.invites) {
    const days = daysUntil(invite.expiresAt, now);
    if (invite.expiresAt == null || days == null || days < 0 || days > 14) continue;
    candidates.push({
      key: `invite-${invite.id}`,
      when: Date.parse(invite.expiresAt),
      deadline: invite.expiresAt,
      title: invite.listingTitle
        ? `Invitation to apply: ${invite.listingTitle}`
        : "An invitation to apply expires",
      sub: invite.location ? `${invite.location} · they invited you` : "they invited you",
      ctaLabel: "View invite",
      ctaHref: "/invites",
      primary: false,
    });
  }

  candidates.sort((a, b) => a.when - b.when);

  return candidates.slice(0, 4).map((candidate) => {
    const isToday =
      candidate.deadline == null ||
      new Date(candidate.when).toDateString() === now.toDateString();
    const days = candidate.deadline ? daysUntil(candidate.deadline, now) : 0;
    return {
      key: candidate.key,
      dayLabel: isToday
        ? "TODAY"
        : formatDate(new Date(candidate.when).toISOString(), {
            weekday: "short",
          }).toUpperCase(),
      dateLabel: formatDate(new Date(candidate.when).toISOString(), {
        month: "short",
        day: "numeric",
      }),
      urgent: days != null && days <= 3,
      title: candidate.title,
      sub: candidate.sub,
      ctaLabel: candidate.ctaLabel,
      ctaHref: candidate.ctaHref,
      primary: candidate.primary,
    };
  });
}

/* ───────────────────────────── the season line ──────────────────────────── */

export interface SeasonSpan {
  readonly key: string;
  readonly kind: "offer" | "accepted" | "applied";
  readonly label: string;
  readonly startPct: number;
  readonly endPct: number;
}

export interface SeasonMark {
  readonly key: string;
  readonly kind: "today" | "decision" | "begins";
  readonly label: string;
  readonly pct: number;
}

export interface SeasonLineModel {
  readonly monthTicks: readonly { readonly pct: number; readonly label: string }[];
  readonly spans: readonly SeasonSpan[];
  readonly marks: readonly SeasonMark[];
}

/**
 * The season on one line: today → the furthest real date in play. Spans need
 * BOTH season dates; a listing with only begins_at contributes a mark. Returns
 * null when nothing in the board carries a date — the section simply doesn't
 * render (an empty timeline is a decoration, not information).
 */
export function buildSeasonLine(board: SeasonBoard, now: Date): SeasonLineModel | null {
  const datedApplications = [...board.offers, ...board.accepted, ...board.inMotion];

  const dates: number[] = [now.getTime()];
  for (const application of datedApplications) {
    const listing = application.listing;
    if (!listing) continue;
    if (listing.begins) dates.push(Date.parse(listing.begins));
    if (listing.ends) dates.push(Date.parse(listing.ends));
    if (application.expiresAt) dates.push(Date.parse(application.expiresAt));
  }
  const valid = dates.filter((t) => !Number.isNaN(t));
  const max = Math.max(...valid);
  if (valid.length < 2 || max <= now.getTime()) {
    return null;
  }

  const start = now.getTime() - 3 * DAY_MS;
  const range = max + 14 * DAY_MS - start;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - start) / range) * 100));

  const spans: SeasonSpan[] = [];
  const marks: SeasonMark[] = [
    { key: "today", kind: "today", label: "Today", pct: pct(now.getTime()) },
  ];

  for (const application of datedApplications) {
    const listing = application.listing;
    if (!listing) continue;
    const kind: SeasonSpan["kind"] =
      application.status === "offered"
        ? "offer"
        : application.status === "accepted"
          ? "accepted"
          : "applied";
    const begins = listing.begins ? Date.parse(listing.begins) : NaN;
    const ends = listing.ends ? Date.parse(listing.ends) : NaN;
    if (!Number.isNaN(begins) && !Number.isNaN(ends) && ends > begins) {
      spans.push({
        key: `${application.id}-span`,
        kind,
        label: listing.title,
        startPct: pct(begins),
        endPct: pct(ends),
      });
    } else if (!Number.isNaN(begins)) {
      marks.push({
        key: `${application.id}-begins`,
        kind: "begins",
        label: `${listing.title} begins`,
        pct: pct(begins),
      });
    }
    if (application.status === "offered" && application.expiresAt) {
      const t = Date.parse(application.expiresAt);
      if (!Number.isNaN(t)) {
        marks.push({
          key: `${application.id}-decision`,
          kind: "decision",
          label: `Decide by ${formatDayDate(application.expiresAt)}`,
          pct: pct(t),
        });
      }
    }
  }

  if (spans.length === 0 && marks.length <= 1) {
    return null;
  }

  const monthTicks: { pct: number; label: string }[] = [];
  const cursor = new Date(start);
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() + 1);
  const end = start + range;
  while (cursor.getTime() < end && monthTicks.length < 14) {
    monthTicks.push({
      pct: pct(cursor.getTime()),
      label: formatDate(cursor.toISOString(), { month: "short" }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return { monthTicks, spans, marks };
}

/* ─────────────────────── movement lines for In Motion ───────────────────── */

/** "Host began review · yesterday" / "Submitted · Jul 28" — last real movement. */
export function movementLine(
  application: ApplicationWithListing,
  now: Date,
): string {
  if (application.reviewedAt) {
    const when = relativeRecency(application.reviewedAt, now);
    if (when) return `Host began review · ${when}`;
  }
  const submitted = relativeRecency(application.submittedAt, now);
  return submitted ? `Submitted · ${submitted}` : "Submitted";
}

/** The honest next step for an in-motion row. */
export function nextStepLine(application: ApplicationWithListing): string {
  if (application.status === "reviewing") return "In review — no action needed";
  return "Awaiting host review";
}
