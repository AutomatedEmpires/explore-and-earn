// Flow D's Applicants, as plain functions: which applicants wait on a reply, how an applicant
// fills the shared CandidateCard, and how long a pass can still be undone. Client-safe.
import type { ApplicantCardData, ApplicationStatus } from '@/lib/hiring';
import { PASS_UNDO_MS } from '@/lib/hiring';

/** Applicants still waiting on the host: new and shortlisted. */
export const WAITING_STATUSES: readonly ApplicationStatus[] = ['new', 'shortlisted'];

/**
 * The list query. `status` is sent as two values so the server reads it as a list (apiRoute
 * turns one value into a plain string, which the array schema refuses).
 */
export function applicantsQuery(cursor?: string | null): string {
  const q = new URLSearchParams();
  for (const status of WAITING_STATUSES) q.append('status', status);
  q.set('sort', 'newest');
  if (cursor) q.set('cursor', cursor);
  return q.toString();
}

export function fullName(item: ApplicantCardData): string {
  return `${item.card.firstName} ${item.card.lastName}`.trim();
}

export function locationLabel(item: ApplicantCardData): string {
  const { city, region } = item.card;
  return region ? `${city}, ${region}` : city;
}

const DAY_MS = 24 * 60 * 60_000;

function localDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days between the application and now, on this device's clock. */
export function appliedDaysAgo(appliedAt: string, now: Date): number {
  const at = new Date(appliedAt);
  if (Number.isNaN(at.getTime())) return 0;
  return Math.max(0, Math.round((localDay(now) - localDay(at)) / DAY_MS));
}

/** "May 10, 2027" for an ISO date (the date as written, whatever the time zone). */
export function formatDate(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/** Where the Reply button goes: the reply step in Messages. */
export function replyHref(replyBase: string, threadId: string): string {
  return `${replyBase}/${encodeURIComponent(threadId)}/reply`;
}

/** The frozen application the card's title opens. */
export function resumeHref(applicationId: string): string {
  return `/api/v1/host/applications/${encodeURIComponent(applicationId)}/resume.pdf`;
}

export function skillsCount(item: ApplicantCardData): number {
  return item.card.skills.length;
}

/** Milliseconds left to undo a pass, never negative; the full window when the time is unreadable. */
export function undoRemainingMs(undoUntil: string, now: number): number {
  const until = new Date(undoUntil).getTime();
  if (Number.isNaN(until)) return PASS_UNDO_MS;
  return Math.max(0, Math.min(until - now, PASS_UNDO_MS));
}

/** The applicants a list shows: waiting ones, minus any whose pass is still pending. */
export function waiting(items: ApplicantCardData[]): ApplicantCardData[] {
  return items.filter((item) => WAITING_STATUSES.includes(item.status) && item.undoUntil === null);
}

/** Puts an applicant back where it was, or at the end when the list got shorter. */
export function restoreAt(
  items: ApplicantCardData[],
  item: ApplicantCardData,
  index: number,
): ApplicantCardData[] {
  if (items.some((i) => i.applicationId === item.applicationId)) return items;
  const at = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, at), item, ...items.slice(at)];
}
