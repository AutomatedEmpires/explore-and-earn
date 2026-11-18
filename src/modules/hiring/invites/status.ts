// How an invite's stored status reads to each side (SP5 spec 8.4). Reads treat a `sent` invite
// past `expires_at` as expired before the sweep runs. A held note is never delivered: the host
// sees "Not delivered" and the seeker never sees the invite at all.
import type { HostInviteStatus, InviteStatus } from '@/lib/hiring';

type Stored = { status: string; scanState: string; expiresAt: Date };

/** Delivered to the seeker: the note scan cleared it, or released it with a warning. */
export const DELIVERED = ['clear', 'warn'] as const;

export function isDelivered(scanState: string): boolean {
  return scanState === 'clear' || scanState === 'warn';
}

export function seekerInviteStatus(row: Stored, now: Date): InviteStatus {
  if (row.status === 'sent' && row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return row.status as InviteStatus;
}

export function hostInviteStatus(row: Stored, now: Date): HostInviteStatus {
  if (row.scanState === 'held' && (row.status === 'sent' || row.status === 'expired')) {
    return 'not_delivered';
  }
  return seekerInviteStatus(row, now);
}
