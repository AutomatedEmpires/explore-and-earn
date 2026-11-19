// Shared setup for SP8 unit tests.
import { sql } from 'drizzle-orm';
import { type DbOrTx } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { newId } from '@/lib/ids';
import { QUEUES, type Queue } from '@/modules/trust';
import { FIXED_NOW, seedHostOrg, seedMedia, seedMember, seedSeeker } from './sp2';

export { FIXED_NOW, seedHostOrg, seedMedia, seedMember, seedSeeker };

function writeEnv(key: string, value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, key);
  else process.env[key] = value;
}

/** An on-shift operator covering every queue, unless the caller narrows that. */
export async function seedOperator(
  db: DbOrTx,
  o: { role?: 'owner' | 'operator'; queues?: Queue[]; email?: string; onShift?: boolean } = {},
): Promise<{ userId: string; clerkUserId: string; email: string }> {
  const userId = newId();
  const email = (o.email ?? `${userId}@ops.test`).toLowerCase();
  const queues = (o.queues ?? [...QUEUES]).map((queue) => `"${queue}"`).join(',');
  await db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${userId}, ${`user_${userId}`}, ${email}, 'Operator', 'operator')
  `);
  await db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status)
    values (
      ${userId},
      ${o.role ?? 'operator'},
      ${`{${queues}}`}::text[],
      ${o.onShift === false ? 'away' : 'on_shift'}
    )
  `);
  return { userId, clerkUserId: `user_${userId}`, email };
}

/** Sets env keys for one call, then restores the previous values and the parsed env. */
export async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) writeEnv(key, value);
  resetEnvCache();
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) writeEnv(key, value);
    resetEnvCache();
  }
}
