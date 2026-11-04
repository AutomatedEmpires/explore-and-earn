// Reads of user accounts for this module. app.users belongs to identity, and identity imports
// this module (its Clerk sync writes organizations and memberships), so a static import back
// would be an evaluation-order cycle. The few columns the team screens need are read here, in
// one place, so moving them behind an identity lookup later touches only this file.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';

export type Person = {
  id: string;
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
  deleted: boolean;
};

type PersonRow = {
  id: string;
  clerk_user_id: string;
  email: string | null;
  display_name: string | null;
  deleted: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Users by our id (deleted ones included, flagged). Unknown ids are left out. */
export async function getPeople(
  db: DbOrTx,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, Person>> {
  const unique = [
    ...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id))),
  ];
  const out = new Map<string, Person>();
  if (unique.length === 0) return out;
  const rows = await queryRows<PersonRow>(
    db,
    sql`select id, clerk_user_id, email, display_name, deleted_at is not null as deleted
        from app.users
        where id in (${sql.join(
          unique.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
  );
  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      clerkUserId: r.clerk_user_id,
      email: r.email,
      displayName: r.display_name,
      deleted: r.deleted,
    });
  }
  return out;
}

/** Ids of the live (not deleted) users whose email equals `email`, ignoring letter case. */
export async function userIdsWithEmail(db: DbOrTx, email: string): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(
    db,
    sql`select id from app.users
        where lower(email) = ${email.trim().toLowerCase()} and deleted_at is null`,
  );
  return rows.map((r) => r.id);
}

/** How a person is named to their team: their display name, else their email. */
export function personLabel(p: Person | undefined, fallback = 'A team member'): string {
  const name = p?.displayName?.trim();
  if (name) return name;
  const email = p?.email?.trim();
  return email || fallback;
}
