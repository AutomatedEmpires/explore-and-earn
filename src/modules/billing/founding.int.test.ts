// Runs against a real Postgres (CI's postgis service, already migrated by `pnpm db:migrate`).
// PGlite has a single connection, so only a real server shows 101 checkouts racing for the
// last founding spots: the advisory lock lets exactly `max` holds through.
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeClient, createDb, queryRows, withTx } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { getSetting, setSetting } from '@/modules/settings';
import { seedHostOrg } from '../../../tests/helpers/sp2';
import {
  createFoundingCodes,
  getFoundingCount,
  hashFoundingCode,
  holdFoundingCode,
  normalizeFoundingCode,
} from './founding';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

const operatorId = newId();
const codes: string[] = [];
let previousMax: number | undefined;

afterAll(async () => {
  if (codes.length > 0) {
    const hashes = codes.map((c) => hashFoundingCode(normalizeFoundingCode(c) as string));
    await db.execute(sql`
      delete from app.founding_codes
      where code_hash in (${sql.join(
        hashes.map((h) => sql`${h}`),
        sql`, `,
      )})
    `);
  }
  if (previousMax !== undefined) {
    await setSetting(db, 'founding.max_hosts', previousMax, { operatorId });
  }
  await closeClient(db);
});

describe('founding holds under concurrency', () => {
  it('lets exactly 100 of 101 concurrent holds through when 100 spots are left', async () => {
    previousMax = await getSetting(db, 'founding.max_hosts');
    const before = await getFoundingCount(db);
    // Exactly 100 spots left, whatever earlier runs left behind.
    await setSetting(db, 'founding.max_hosts', before.redeemed + before.held + 100, {
      operatorId,
    });

    codes.push(...(await createFoundingCodes(db, { count: 100, note: 'int', operatorId: null })));
    codes.push(...(await createFoundingCodes(db, { count: 1, note: 'int', operatorId: null })));
    const orgs: Awaited<ReturnType<typeof seedHostOrg>>[] = [];
    for (let i = 0; i < codes.length; i++) {
      orgs.push(await seedHostOrg(db, { name: `Founding Race ${newId().slice(-6)}` }));
    }

    const until = new Date(Date.now() + 31 * 60_000);
    const results = await Promise.allSettled(
      codes.map((code, i) =>
        withTx(db, (tx) => holdFoundingCode(tx, { orgId: orgs[i]?.orgId ?? '', code, until })),
      ),
    );

    const held = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');
    expect(held).toHaveLength(100);
    expect(refused).toHaveLength(1);
    const [reason] = refused.map((r) => (r as PromiseRejectedResult).reason as unknown);
    expect(isAppError(reason) && reason.code).toBe('conflict');
    expect(isAppError(reason) && reason.details).toEqual({ reason: 'founding_unavailable' });

    const [row] = await queryRows<{ n: number }>(
      db,
      sql`select count(*)::int as n from app.founding_codes
          where note = 'int' and status = 'held' and held_until > now()`,
    );
    expect(row?.n).toBeGreaterThanOrEqual(100);
  });
});
