// Pipeline counts for host analytics. The SQL stays in hiring: pipeline_events and
// pipeline_entries belong to this module, and analytics may not name them.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { SOURCE_LABELS } from '@/lib/hiring';

function uuidList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

export async function countPipelineKinds(
  db: DbOrTx,
  orgId: string,
  listingIds: string[],
  kinds: readonly string[],
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  if (listingIds.length === 0 || kinds.length === 0) return new Map();
  const rows = await queryRows<{ kind: string; n: number }>(
    db,
    sql`
      select kind, count(*)::int as n
      from app.pipeline_events
      where org_id = ${orgId}::uuid
        and listing_id in (${uuidList(listingIds)})
        and kind in (${sql.join(
          kinds.map((kind) => sql`${kind}`),
          sql`, `,
        )})
        and occurred_at >= ${from.toISOString()}::timestamptz
        and occurred_at < ${to.toISOString()}::timestamptz
      group by kind
    `,
  );
  return new Map(rows.map((row) => [row.kind, Number(row.n)]));
}

export async function firstPipelineEventAt(db: DbOrTx, orgId: string): Promise<Date | null> {
  const [row] = await queryRows<{ at: string | null }>(
    db,
    sql`
      select min(occurred_at)::text as at
      from app.pipeline_events
      where org_id = ${orgId}::uuid
    `,
  );
  return row?.at ? new Date(row.at) : null;
}

export async function applicationsByListing(
  db: DbOrTx,
  orgId: string,
  listingIds: string[],
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  if (listingIds.length === 0) return new Map();
  const rows = await queryRows<{ listingId: string; n: number }>(
    db,
    sql`
      select listing_id::text as "listingId", count(*)::int as n
      from app.pipeline_events
      where org_id = ${orgId}::uuid
        and listing_id in (${uuidList(listingIds)})
        and kind = 'applied'
        and occurred_at >= ${from.toISOString()}::timestamptz
        and occurred_at < ${to.toISOString()}::timestamptz
      group by listing_id
    `,
  );
  return new Map(rows.map((row) => [row.listingId, Number(row.n)]));
}

export async function applicationSources(
  db: DbOrTx,
  orgId: string,
  listingIds: string[],
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  if (listingIds.length === 0) return new Map();
  const rows = await queryRows<{ source: string | null; n: number }>(
    db,
    sql`
      select source, count(*)::int as n
      from app.pipeline_events
      where org_id = ${orgId}::uuid
        and listing_id in (${uuidList(listingIds)})
        and kind = 'applied'
        and occurred_at >= ${from.toISOString()}::timestamptz
        and occurred_at < ${to.toISOString()}::timestamptz
      group by source
    `,
  );
  const out = new Map<string, number>();
  for (const row of rows) {
    const key = row.source && SOURCE_LABELS[row.source as keyof typeof SOURCE_LABELS] ? row.source : 'other';
    out.set(key, (out.get(key) ?? 0) + Number(row.n));
  }
  return out;
}

export async function pipelineStatusCounts(
  db: DbOrTx,
  orgId: string,
  listingIds: string[],
): Promise<Map<string, number>> {
  if (listingIds.length === 0) return new Map();
  const rows = await queryRows<{ status: string; n: number }>(
    db,
    sql`
      select status, count(*)::int as n
      from app.pipeline_entries
      where org_id = ${orgId}::uuid
        and listing_id in (${uuidList(listingIds)})
      group by status
    `,
  );
  return new Map(rows.map((row) => [row.status, Number(row.n)]));
}

export async function weeklyApplications(
  db: DbOrTx,
  orgId: string,
  listingIds: string[],
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  if (listingIds.length === 0) return new Map();
  const rows = await queryRows<{ week: string; n: number }>(
    db,
    sql`
      select to_char(date_trunc('week', occurred_at at time zone 'UTC'), 'YYYY-MM-DD') as week,
        count(*)::int as n
      from app.pipeline_events
      where org_id = ${orgId}::uuid
        and listing_id in (${uuidList(listingIds)})
        and kind = 'applied'
        and occurred_at >= ${from.toISOString()}::timestamptz
        and occurred_at < ${to.toISOString()}::timestamptz
      group by 1
    `,
  );
  return new Map(rows.map((row) => [row.week, Number(row.n)]));
}
