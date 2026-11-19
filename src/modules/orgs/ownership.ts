// Who a person still belongs to. Live memberships in organizations that are not deleted.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import type { OrgRole } from './schema';

export async function getOwnershipSummary(
  db: DbOrTx,
  userId: string,
): Promise<{ orgId: string; name: string; role: OrgRole; otherMembers: number }[]> {
  return queryRows<{ orgId: string; name: string; role: OrgRole; otherMembers: number }>(db, sql`
    select m.org_id as "orgId", o.name, m.role,
      (
        select count(*)::int from app.org_memberships other
        where other.org_id = m.org_id
          and other.deleted_at is null
          and other.user_id <> m.user_id
      ) as "otherMembers"
    from app.org_memberships m
    join app.organizations o on o.id = m.org_id
    where m.user_id = ${userId}::uuid
      and m.deleted_at is null
      and o.deleted_at is null
    order by o.name, m.org_id
  `);
}
