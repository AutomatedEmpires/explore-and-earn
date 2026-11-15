// Browse by State counts (FD-8 addendum, plan Task 49): one entry per US_STATES code, in that
// order, from the same active rows and filter as Seek for a guest. A state's count is the total
// Seek shows for `?state=<code>`, so the number on the map is the number on the page it opens:
// - on-site listings in the state;
// - Remote listings open to the state by name;
// - Remote listings open to the whole US, added to every state.
// Each count is capped like Seek's total.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { resolveTimeZone, todayIn, US_STATES, type StateCount } from '@/lib/discovery';
import { buildFilterSql, textArray } from './filters';
import { TOTAL_CAP } from './search';

export async function countListingsByState(db: DbOrTx, i: { tz: string }): Promise<StateCount[]> {
  const where = buildFilterSql(
    {},
    {
      today: todayIn(resolveTimeZone(i.tz)),
      viewerUserId: null,
      surface: 'seek',
      applied: [],
      hidden: [],
    },
  );
  const codes = US_STATES.map((s) => s.code);
  // A listing counts once per state: `union` drops a Remote row's repeated states, and a row
  // open to the whole US is only in the US group.
  const rows = await queryRows<{ code: string; n: number }>(
    db,
    sql`with base as (
        select dl.listing_id, dl.state::text as state, dl.remote, dl.remote_states
        from app.discovery_listings dl
        where ${where}
      ), named as (
        select state as code, listing_id from base where not remote
        union
        select s as code, listing_id from base, unnest(remote_states) s
        where remote and not ('US' = any(remote_states))
      ), by_code as (
        select code, count(*)::int as n from named group by code
      ), everywhere as (
        select count(*)::int as n from base where remote and 'US' = any(remote_states)
      )
      select c.code, (coalesce(k.n, 0) + e.n)::int as n
      from unnest(${textArray(codes)}) as c(code)
      cross join everywhere e
      left join by_code k on k.code = c.code`,
  );
  const counts = new Map(rows.map((r) => [r.code, r.n]));
  return codes.map((code) => {
    const n = counts.get(code) ?? 0;
    return n > TOTAL_CAP
      ? { code, count: TOTAL_CAP, capped: true }
      : { code, count: n, capped: false };
  });
}
