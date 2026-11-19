// Retention for automatic safety checks (SP8 spec 8.3): 12 months, except a check an operator
// still has to decide on. Once its review item is resolved the next sweep removes it.
//
// A check about a person or organization under a legal hold of any scope is kept too (lead
// decision 2026-11-18): checks are the safety record an investigation reads. "About" means the
// check's subject is them, or is a file, listing revision, message, invite, interview, offer or
// bulk message they own, or a review item on the check is about them.
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import type { RetentionRule } from '@/modules/privacy';

const KEEP_MONTHS = 12;

/** The same instant `months` calendar months earlier (UTC). */
function monthsBefore(now: Date, months: number): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

type ForeignRef = { table_name: string; column_name: string };

/**
 * Other modules' columns with a foreign key to a check (a verification keeps the check that
 * decided it). A check such a row still points at is kept: deleting it would fail the whole
 * batch, and the owning module decides when its own row goes. Read from the catalog, so a
 * foreign key added later is honored without a change here.
 */
async function foreignRefs(db: DbOrTx): Promise<ForeignRef[]> {
  return queryRows<ForeignRef>(
    db,
    sql`
      select cl.relname as table_name, a.attname as column_name
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.confrelid = 'app.trust_checks'::regclass
        and n.nspname = 'app'
        and cardinality(c.conkey) = 1
        and cl.relname <> 'review_items'
    `,
  );
}

type UnderLegalHold = typeof import('@/modules/privacy').underLegalHold;

/** Subject types whose id is the person's own user id, and those whose id is the org's own id. */
const PERSON_SUBJECTS = ['user', 'seeker_profile'];
const ORG_SUBJECTS = ['organization', 'host_page', 'business_verification'];

/**
 * Subject types owned by a person or organization recorded on the subject's own row: the row
 * (aliased `s`, joined as needed) and its owner columns.
 */
const OWNED_SUBJECTS: { type: string; from: SQL; users: SQL[]; orgs: SQL[] }[] = [
  {
    type: 'media',
    from: sql`app.media s`,
    users: [sql`s.owner_user_id`],
    orgs: [sql`s.owner_org_id`],
  },
  { type: 'listing_revision', from: sql`app.listing_revisions s`, users: [], orgs: [sql`s.org_id`] },
  {
    type: 'message',
    from: sql`app.messages s join app.threads s_thread on s_thread.id = s.thread_id`,
    users: [sql`s.sender_user_id`, sql`s_thread.seeker_user_id`],
    orgs: [sql`s_thread.org_id`],
  },
  {
    type: 'invite',
    from: sql`app.invites s`,
    users: [sql`s.seeker_user_id`],
    orgs: [sql`s.org_id`],
  },
  { type: 'interview', from: sql`app.interviews s`, users: [], orgs: [sql`s.org_id`] },
  { type: 'offer', from: sql`app.offers s`, users: [], orgs: [sql`s.org_id`] },
  { type: 'bulk_message', from: sql`app.bulk_messages s`, users: [], orgs: [sql`s.org_id`] },
];

const list = (values: readonly string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

/** The person and organization a check or review item (alias `a`) names directly. */
function namedBy(a: 'c' | 'r'): { users: SQL[]; orgs: SQL[] } {
  const row = sql.raw(a);
  return {
    users: [sql`case when ${row}.subject_type in (${list(PERSON_SUBJECTS)}) then ${row}.subject_id end`],
    orgs: [sql`case when ${row}.subject_type in (${list(ORG_SUBJECTS)}) then ${row}.subject_id end`],
  };
}

/** The check's subject id as a uuid, or null when it is not one (so the cast never fails). */
const SUBJECT_UUID = sql`(case when c.subject_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then c.subject_id::uuid end)`;

/** True for a check (alias `c`) about a person or organization under a hold of any scope. */
function heldCheck(underLegalHold: UnderLegalHold): SQL {
  const owned = OWNED_SUBJECTS.map(
    (o) => sql`exists (
      select 1 from ${o.from}
      where c.subject_type = ${o.type} and s.id = ${SUBJECT_UUID}
        and ${underLegalHold({ users: o.users, orgs: o.orgs, scope: 'any' })}
    )`,
  );
  return sql`(
    ${underLegalHold({ ...namedBy('c'), scope: 'any' })}
    or ${sql.join(owned, sql` or `)}
    or exists (
      select 1 from app.review_items r
      where r.check_id = c.id and ${underLegalHold({ ...namedBy('r'), scope: 'any' })}
    )
  )`;
}

export const retentionRules: RetentionRule[] = [
  {
    key: 'trust.checks_12m',
    description: 'Records of automatic safety checks are deleted after 12 months.',
    async run(db, now, limit) {
      const cutoff = monthsBefore(now, KEEP_MONTHS).toISOString();
      const refs = await foreignRefs(db);
      // Loaded on first use: the privacy barrel loads this module's barrel.
      const { underLegalHold } = await import('@/modules/privacy');
      const held = heldCheck(underLegalHold);
      const unreferenced = sql.join(
        refs.map(
          (ref) => sql`and not exists (
            select 1 from ${sql.identifier('app')}.${sql.identifier(ref.table_name)} f
            where f.${sql.identifier(ref.column_name)} = c.id
          )`,
        ),
        sql` `,
      );

      return db.transaction(async (tx) => {
        const candidates = await queryRows<{ id: string }>(
          tx,
          sql`
            select c.id from app.trust_checks c
            where c.created_at < ${cutoff}::timestamptz
              and not exists (
                select 1 from app.review_items r
                where r.check_id = c.id and r.status <> 'resolved'
              )
              ${unreferenced}
              and not ${held}
            order by c.created_at
            limit ${limit}
            for update of c skip locked
          `,
        );
        if (candidates.length === 0) return { deleted: 0 };
        const ids = sql.join(
          candidates.map((row) => sql`${row.id}::uuid`),
          sql`, `,
        );
        // A resolved item keeps its own reason and confidence; only the link to the check goes.
        await tx.execute(sql`
          update app.review_items set check_id = null
          where check_id in (${ids}) and status = 'resolved'
        `);
        const deleted = await queryRows(
          tx,
          sql`delete from app.trust_checks where id in (${ids}) returning id`,
        );
        return { deleted: deleted.length };
      });
    },
  },
];
