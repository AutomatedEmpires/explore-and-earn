// Mutes (SP4 spec 8.7): a muted host can't invite, and muting unfollows it. W0 stub: W5
// implements it (Task 25).
import type { DbOrTx } from '@/lib/db';

export async function mute(_db: DbOrTx, _i: { userId: string; orgId: string }): Promise<void> {
  throw new Error('not implemented: mute');
}

export async function unmute(_db: DbOrTx, _i: { userId: string; orgId: string }): Promise<void> {
  throw new Error('not implemented: unmute');
}

export async function listMutes(
  _db: DbOrTx,
  _userId: string,
): Promise<{ orgId: string; mutedAt: Date }[]> {
  return [];
}
