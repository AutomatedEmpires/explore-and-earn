// The reply step of flow D as plain functions: the note it starts with, what a failed send means
// for the host, the words for a read-only conversation, and the verified-host gate's refusal.
// Client-safe.
import { ApiError } from '@/app/_features/api';
import type { ReadOnlyReason } from '@/lib/messaging';

const DAY_MS = 24 * 60 * 60_000;

/**
 * The ready-to-send note (Figma 45:14113): "Thanks for applying. Can you start May 18?" with the
 * listing's start date, or a question about the start when there is no date or it has passed.
 * The year is shown only when the start is more than a year away.
 */
export function defaultReply(startDate: string | null, now: Date): string {
  const start = startDate ? new Date(`${startDate.slice(0, 10)}T00:00:00Z`) : null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!start || Number.isNaN(start.getTime()) || start.getTime() < today) {
    return 'Thanks for applying. When could you start?';
  }
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(start.getTime() - today >= 365 * DAY_MS ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  }).format(start);
  return `Thanks for applying. Can you start ${label}?`;
}

export type SendProblem = 'offline' | 'read_only' | 'rate_limited' | 'failed';

export function sendProblem(err: unknown): SendProblem {
  if (!(err instanceof ApiError)) return 'failed';
  if (err.status === 0) return 'offline';
  if (err.status === 409 && err.reason === 'read_only') return 'read_only';
  if (err.status === 429) return 'rate_limited';
  return 'failed';
}

export const SEND_PROBLEM_COPY: Record<
  Exclude<SendProblem, 'read_only'>,
  { title: string; body: string }
> = {
  offline: {
    title: 'You are offline',
    body: 'Your reply is still here. Send it when you are back online.',
  },
  rate_limited: {
    title: 'You’ve sent a lot of messages',
    body: 'Wait a few minutes, then send your reply again. It is still here.',
  },
  failed: {
    title: 'Your reply didn’t send',
    body: 'Your words are still here. Try sending again.',
  },
};

export function readOnlyText(reason: ReadOnlyReason | null, firstName: string): string {
  switch (reason) {
    case 'withdrawn':
      return `${firstName} withdrew this application, so you can’t send more messages.`;
    case 'blocked':
      return 'You and this applicant can’t message each other.';
    case 'listing_closed':
      return 'The listing closed more than 90 days ago, so this conversation is closed.';
    case 'removed':
    default:
      return 'This conversation is closed.';
  }
}

/**
 * The statuses the verified-host gate refuses (`hostApplicantGate`, issues 182 and 199), as the
 * 409's `verification_<status>` reason names them. Only a verified host may message applicants.
 */
const REFUSED_STATUSES = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;
export type RefusedStatus = (typeof REFUSED_STATUSES)[number];
export type VerificationRefusal = { status: RefusedStatus; copy: string };

export const VERIFICATION_REFUSED_TITLE =
  'You can message applicants once your business is verified';

/**
 * The verified-host gate's refusal on a thread read or a send: a 409 `verification_<status>`.
 * Its message is the applicant list's own refusal for that status, word for word, and it names
 * the next step ("Answer our verification question to see your applicants."), so the screen
 * shows it as sent. Any other failure is null and keeps its usual words.
 */
export function verificationRefusal(err: unknown): VerificationRefusal | null {
  if (!(err instanceof ApiError) || err.status !== 409 || !err.reason) return null;
  const status = REFUSED_STATUSES.find((s) => err.reason === `verification_${s}`);
  return status ? { status, copy: err.message } : null;
}

/** A stable id for one reply, so a retry after a failed send is stored once. */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `reply-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
