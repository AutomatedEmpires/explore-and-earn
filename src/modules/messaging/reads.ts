// W0 stub. The owning workstream replaces the body and keeps the name.
import type { DbOrTx } from '@/lib/db';

export async function unreadThreadCount(
  _db: DbOrTx,
  _userId: string,
  _o?: { orgId?: string },
): Promise<number> {
  return 0;
}

export async function markThreadRead(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: markThreadRead (W4)');
}
