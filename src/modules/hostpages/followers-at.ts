// How many seekers followed the org at an instant. Analytics compares two of these.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';

export async function countFollowersAt(db: DbOrTx, orgId: string, at: Date): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from app.host_follows
        where org_id = ${orgId} and created_at <= ${at}`,
  );
  return row?.n ?? 0;
}
