// Unread counts for the signed-in user's top bar, pushed by GET /api/v1/me/stream.
// Shared touchpoint: Task 17 fills in `notifications`; inbox arrives with messaging.
import type { DbOrTx } from '@/lib/db';

export async function getCounts(
  _db: DbOrTx,
  _userId: string,
): Promise<{ inbox: number; notifications: number }> {
  return { inbox: 0, notifications: 0 };
}
