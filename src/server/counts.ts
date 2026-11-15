// Unread counts for the signed-in user's top bar, pushed by GET /api/v1/me/stream.
// Shared touchpoint: `notifications` comes from the notifications module (Task 17); inbox
// arrives with messaging; `profileDot` is SP4's "Profile, needs attention" dot (spec 3.4).
import type { DbOrTx } from '@/lib/db';
import { unreadCount } from '@/modules/notifications';
import { needsAttention } from '@/modules/profiles';

export async function getCounts(
  db: DbOrTx,
  userId: string,
): Promise<{ inbox: number; notifications: number; profileDot: boolean }> {
  const notifications = await unreadCount(db, userId);
  const profileDot = await needsAttention(db, userId);
  return { inbox: 0, notifications, profileDot };
}
