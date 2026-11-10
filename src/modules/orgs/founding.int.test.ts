// Runs against a real Postgres (CI's postgis service, already migrated by `pnpm db:migrate`).
// PGlite has a single connection, so only a real server shows signups racing for the last
// founding numbers: the advisory lock lets exactly the free ones through, in order, and
// organization 101 gets none (FD-7).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeClient, createDb, queryRows, withTx } from '@/lib/db';
import { seedHostOrg, type SeededOrg } from '../../../tests/helpers/sp2';
import { FOUNDING_COHORT_SIZE, countFoundingCohort, reserveFoundingNumber } from './founding';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

const seeded: SeededOrg[] = [];

afterAll(async () => {
  for (const o of seeded) {
    await db.execute(sql`delete from app.founding_cohort where org_id = ${o.orgId}`);
    await db.execute(sql`delete from app.org_memberships where org_id = ${o.orgId}`);
    await db.execute(sql`delete from app.org_slugs where org_id = ${o.orgId}`);
    await db.execute(sql`delete from app.organizations where id = ${o.orgId}`);
    await db.execute(sql`delete from app.users where id = ${o.owner.userId}`);
  }
  await closeClient(db);
});

describe('reserveFoundingNumber under concurrent signups', () => {
  it('hands out every free number once, then refuses the next signup', async () => {
    const free = FOUNDING_COHORT_SIZE - (await countFoundingCohort(db));
    for (let i = 0; i < free + 1; i++) {
      seeded.push(await seedHostOrg(db, { name: `Racing Lodge ${i}` }));
    }

    const results = await Promise.all(
      seeded.map((o) => withTx(db, (tx) => reserveFoundingNumber(tx, o.orgId))),
    );

    const numbers = results.filter((n): n is number => n !== null);
    expect(numbers).toHaveLength(free);
    expect(results.filter((n) => n === null)).toHaveLength(1);
    expect(new Set(numbers).size).toBe(free);
    expect(Math.max(0, ...numbers)).toBeLessThanOrEqual(FOUNDING_COHORT_SIZE);
    expect(await countFoundingCohort(db)).toBe(FOUNDING_COHORT_SIZE);

    const [dupes] = await queryRows<{ n: number }>(
      db,
      sql`select count(*)::int as n from (
            select founding_number from app.founding_cohort
            group by founding_number having count(*) > 1
          ) d`,
    );
    expect(dupes?.n).toBe(0);
  });
});
