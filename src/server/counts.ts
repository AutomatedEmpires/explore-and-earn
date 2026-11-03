// Unread counts for the signed-in user's top bar, pushed by GET /api/v1/me/stream.
// Shared touchpoint: `notifications` comes from the notifications module (Task 17); inbox
// arrives with messaging.
import type { DbOrTx } from '@/lib/db';
import { unreadCount } from '@/modules/notifications';

export async function getCounts(
  db: DbOrTx,
  userId: string,
): Promise<{ inbox: number; notifications: number }> {
  return { inbox: 0, notifications: await unreadCount(db, userId) };
}
