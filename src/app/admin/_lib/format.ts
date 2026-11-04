// Labels and formatting shared by the console's pages (no server or client specifics).
import type { Queue, ReviewAction, ReviewStatus } from '@/modules/trust';

export const QUEUE_LABEL: Record<Queue, string> = {
  moderation: 'Moderation',
  fraud: 'Fraud',
  reports: 'Reports',
  support: 'Support',
  child_safety: 'Child safety',
  billing: 'Billing',
  appeals: 'Appeals',
  audit_sample: 'Accuracy samples',
};

export const QUEUE_DESCRIPTION: Record<Queue, string> = {
  moderation: 'Content the AI check could not decide',
  fraud: 'Uncertain fraud and verification checks',
  reports: 'Reports from seekers and hosts',
  support: 'Support requests that need a person',
  child_safety: 'Blocked child-safety matches',
  billing: 'Refunds and billing problems',
  appeals: 'Appeals of earlier decisions',
  audit_sample: 'Automatic decisions sampled for a second look',
};

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  open: 'Unassigned',
  assigned: 'Assigned',
  escalated: 'Escalated',
  resolved: 'Resolved',
};

export const ACTION_LABEL: Record<ReviewAction, string> = {
  approve: 'Approve',
  remove: 'Remove',
  ask_info: 'Ask for info',
  suspend: 'Suspend',
  ban: 'Ban',
  refund: 'Refund',
};

export const RESOLUTION_LABEL: Record<ReviewAction, string> = {
  approve: 'Approved',
  remove: 'Removed',
  ask_info: 'Asked for info',
  suspend: 'Suspended',
  ban: 'Banned',
  refund: 'Refunded',
};

/** What each decision does, shown under the buttons and in the confirmations. */
export const ACTION_HINT: Record<ReviewAction, string> = {
  approve: 'The content stays up.',
  remove: 'The content is taken down.',
  ask_info: 'The owner is asked for more information.',
  suspend: 'The account is suspended until restored.',
  ban: 'The account is banned. Needs a second operator once there are two.',
  refund: 'Money goes back to the payer. Large refunds need a second operator.',
};

/**
 * The decisions each subject type supports (its handlers in the owning module). Others get
 * every decision but a refund, which only billing items and test items offer.
 */
export function actionsFor(subjectType: string, queue: Queue): ReviewAction[] {
  if (subjectType === 'media') return ['approve', 'remove'];
  const base: ReviewAction[] = ['approve', 'remove', 'ask_info', 'suspend', 'ban'];
  return queue === 'billing' || subjectType === 'test_item' ? [...base, 'refund'] : base;
}

export const SENSITIVE_ACTIONS: readonly ReviewAction[] = ['ban', 'refund'];

export const SUBJECT_LABEL: Record<string, string> = {
  test_item: 'Test item',
  media: 'Upload',
};

export function subjectLabel(subjectType: string): string {
  return SUBJECT_LABEL[subjectType] ?? subjectType.replace(/_/g, ' ');
}

const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** "Nov 3, 2026, 12:00 PM UTC". The console shows UTC so every operator reads the same time. */
export function formatDateTime(d: Date): string {
  return `${dateTime.format(d)} UTC`;
}

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto', style: 'short' });

/** "in 23 hr", "12 min ago", "now". */
export function formatRelative(d: Date, now: Date = new Date()): string {
  const seconds = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'now';
  if (abs < 45 * 60) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 36 * 60 * 60) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86400), 'day');
}

/** "45 min", "2 hr 5 min". */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** A classifier score as a percentage, "62%". */
export function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** The first 8 characters of an id, for compact display (the full id is in the title). */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
