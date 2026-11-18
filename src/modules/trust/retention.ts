// Retention for automatic safety checks (SP8 spec 8.3): 12 months, except a check an operator
// still has to decide on. Once its review item is resolved the next sweep removes it.
import { sql } from 'drizzle-orm';
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

export const retentionRules: RetentionRule[] = [
  {
    key: 'trust.checks_12m',
    description: 'Records of automatic safety checks are deleted after 12 months.',
    async run(db, now, limit) {
      const cutoff = monthsBefore(now, KEEP_MONTHS).toISOString();
      const refs = await foreignRefs(db);
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
