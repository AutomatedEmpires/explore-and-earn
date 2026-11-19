// Retention for automatic safety checks (SP8 spec 8.3): 12 months, except a check an operator
// still has to decide on. Once its review item is resolved the next sweep removes it.
//
// A check about a person or organization under a legal hold of any scope is kept too (lead
// decision 2026-11-18): checks are the safety record an investigation reads. "About" means the
// check's subject is them, or a file they own (the media module says who), or a review item on
// the check is about them. Checks on a listing revision, message, invite, interview, offer or
// bulk message are not yet matched to their owner: those modules expose no owner lookup.
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

type Privacy = typeof import('@/modules/privacy');
type Held = Awaited<ReturnType<Privacy['heldSubjects']>>;

/** Subject types whose id is the person's own user id, and those whose id is the org's own id. */
const PERSON_SUBJECTS = ['user', 'seeker_profile'];
const ORG_SUBJECTS = ['organization', 'host_page', 'business_verification'];

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

/**
 * True for a check (alias `c`) that names a held person or organization itself, or whose
 * review item does. Read in the same statement as the candidates.
 */
function namesHeld(underLegalHold: Privacy['underLegalHold']): SQL {
  return sql`(
    ${underLegalHold({ ...namedBy('c'), scope: 'any' })}
    or exists (
      select 1 from app.review_items r
      where r.check_id = c.id and ${underLegalHold({ ...namedBy('r'), scope: 'any' })}
    )
  )`;
}

type Candidate = { id: string; subject_type: string; subject_id: string; at: string };

/**
 * The candidates whose subject is a file owned by a held person or organization. The media
 * module says who owns each file; nothing is read when no hold is open.
 */
async function heldThroughFile(db: DbOrTx, page: Candidate[], held: Held): Promise<Set<string>> {
  if (held.users.size + held.orgs.size === 0) return new Set();
  const files = page.filter((row) => row.subject_type === 'media');
  if (files.length === 0) return new Set();
  const { getMediaMeta } = await import('@/modules/media');
  const owners = await getMediaMeta(
    db,
    files.map((row) => row.subject_id),
  );
  return new Set(
    files
      .filter((row) => {
        const owner = owners.get(row.subject_id);
        return (
          owner !== undefined &&
          (held.users.has(owner.ownerUserId) ||
            (owner.ownerOrgId !== null && held.orgs.has(owner.ownerOrgId)))
        );
      })
      .map((row) => row.id),
  );
}

export const retentionRules: RetentionRule[] = [
  {
    key: 'trust.checks_12m',
    description: 'Records of automatic safety checks are deleted after 12 months.',
    async run(db, now, limit) {
      if (limit <= 0) return { deleted: 0 };
      const cutoff = monthsBefore(now, KEEP_MONTHS).toISOString();
      const refs = await foreignRefs(db);
      // Loaded on first use: the privacy and media barrels load this module's barrel.
      const { heldSubjects, underLegalHold } = await import('@/modules/privacy');
      const held = await heldSubjects(db, 'any');
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
        // Pages through the candidates oldest first until `limit` may go, so held checks at the
        // front never stop the ones behind them. With no hold open, one page is enough.
        const due: string[] = [];
        let after: { at: string; id: string } | null = null;
        for (;;) {
          const page: Candidate[] = await queryRows<Candidate>(
            tx,
            sql`
              select c.id, c.subject_type, c.subject_id, c.created_at::text as at
              from app.trust_checks c
              where c.created_at < ${cutoff}::timestamptz
                and not exists (
                  select 1 from app.review_items r
                  where r.check_id = c.id and r.status <> 'resolved'
                )
                ${unreferenced}
                and not ${namesHeld(underLegalHold)}
                ${after ? sql`and (c.created_at, c.id) > (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
              order by c.created_at, c.id
              limit ${limit}
              for update of c skip locked
            `,
          );
          const kept = await heldThroughFile(tx, page, held);
          for (const row of page) {
            if (due.length < limit && !kept.has(row.id)) due.push(row.id);
          }
          const last = page.at(-1);
          if (due.length >= limit || page.length < limit || !last) break;
          after = { at: last.at, id: last.id };
        }
        if (due.length === 0) return { deleted: 0 };
        const ids = sql.join(
          due.map((id) => sql`${id}::uuid`),
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
