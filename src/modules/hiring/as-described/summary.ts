// Aggregate As-described answers. Individual answers never leave this module.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import type { AsDescribedSummary, Tally } from '@/lib/hiring';

const ORG_VISIBLE_AT = 5;
const LISTING_VISIBLE_AT = 3;

function tally(yes: number, partly: number, no: number): Tally {
  return { yes, partly, no };
}

function empty(): AsDescribedSummary {
  const zeros = tally(0, 0, 0);
  return {
    responses: 0,
    visible: false,
    housing: { ...zeros },
    meals: { ...zeros },
    pay: { ...zeros },
  };
}

export async function getAsDescribedSummary(
  db: DbOrTx,
  q: { orgId: string; listingId?: string; listingIds?: string[] },
): Promise<AsDescribedSummary> {
  if (q.listingIds && q.listingIds.length === 0) return empty();

  const filters = [
    sql`org_id = ${q.orgId}::uuid`,
    sql`submitted_at is not null`,
    sql`(eligible_via = 'host_marked' or (eligible_via = 'offer_accepted' and worked_here is true))`,
  ];
  if (q.listingId) filters.push(sql`listing_id = ${q.listingId}::uuid`);
  else if (q.listingIds) {
    filters.push(
      sql`listing_id in (${sql.join(
        q.listingIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }

  const [row] = await queryRows<{
    responses: number;
    housingYes: number;
    housingPartly: number;
    housingNo: number;
    mealsYes: number;
    mealsPartly: number;
    mealsNo: number;
    payYes: number;
    payPartly: number;
    payNo: number;
  }>(
    db,
    sql`
      select
        count(*)::int as responses,
        count(*) filter (where asks_housing and housing = 'yes')::int as "housingYes",
        count(*) filter (where asks_housing and housing = 'partly')::int as "housingPartly",
        count(*) filter (where asks_housing and housing = 'no')::int as "housingNo",
        count(*) filter (where asks_meals and meals = 'yes')::int as "mealsYes",
        count(*) filter (where asks_meals and meals = 'partly')::int as "mealsPartly",
        count(*) filter (where asks_meals and meals = 'no')::int as "mealsNo",
        count(*) filter (where pay = 'yes')::int as "payYes",
        count(*) filter (where pay = 'partly')::int as "payPartly",
        count(*) filter (where pay = 'no')::int as "payNo"
      from app.as_described_responses
      where ${sql.join(filters, sql` and `)}
    `,
  );

  const responses = row?.responses ?? 0;
  return {
    responses,
    visible: responses >= (q.listingId ? LISTING_VISIBLE_AT : ORG_VISIBLE_AT),
    housing: tally(row?.housingYes ?? 0, row?.housingPartly ?? 0, row?.housingNo ?? 0),
    meals: tally(row?.mealsYes ?? 0, row?.mealsPartly ?? 0, row?.mealsNo ?? 0),
    pay: tally(row?.payYes ?? 0, row?.payPartly ?? 0, row?.payNo ?? 0),
  };
}
