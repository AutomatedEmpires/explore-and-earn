// Many users' contact facts at once (SP4: application and availability notices, the host block
// list). app.users belongs to this module, so other modules read addresses only through here.
import { inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { users } from './schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UserContactFacts = { email: string | null; deleted: boolean };

/** Email and deletion state of each known user; unknown (and malformed) ids are omitted. */
export async function getUserContacts(
  db: DbOrTx,
  userIds: string[],
): Promise<Map<string, UserContactFacts>> {
  const wanted = [...new Set(userIds.filter((id) => UUID.test(id)))];
  const out = new Map<string, UserContactFacts>();
  if (wanted.length === 0) return out;
  const rows = await db
    .select({ id: users.id, email: users.email, deletedAt: users.deletedAt })
    .from(users)
    .where(inArray(users.id, wanted));
  for (const r of rows) out.set(r.id, { email: r.email, deleted: r.deletedAt !== null });
  return out;
}
