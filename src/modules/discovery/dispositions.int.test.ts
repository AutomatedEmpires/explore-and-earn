// Runs against a real Postgres (CI's postgis service, already migrated). PGlite has a single
// connection, so the saved-jobs advisory lock is only visible here: two saves racing at
// limit-1, and exactly one of them succeeds (audit K-7).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeClient, createDb, queryRows } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { seedSeeker } from '../../../tests/helpers/sp2';
import { setDisposition } from './dispositions';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

const users: string[] = [];
const listings: string[] = [];

const ids = (values: string[]) => sql.join(values.map((id) => sql`${id}::uuid`), sql`, `);

afterAll(async () => {
  if (listings.length > 0) {
    await db.execute(sql`delete from app.listing_events where listing_id in (${ids(listings)})`);
    await db.execute(sql`delete from app.listing_dispositions where listing_id in (${ids(listings)})`);
    await db.execute(sql`delete from app.discovery_listings where listing_id in (${ids(listings)})`);
  }
  if (users.length > 0) {
    await db.execute(sql`delete from app.users where id in (${ids(users)})`);
  }
  await closeClient(db);
});

describe('setDisposition saved-jobs quota', () => {
  it('lets exactly one of two concurrent saves through at limit minus one', async () => {
    const [previous] = await queryRows<{ value: string }>(
      db,
      sql`select value::text as value from app.settings where key = 'discovery.saved_jobs_per_user'`,
    );
    await db.execute(sql`
      insert into app.settings (key, value) values ('discovery.saved_jobs_per_user', '2'::jsonb)
      on conflict (key) do update set value = excluded.value
    `);
    try {
      const [kept, a, b] = (await insertProjectionRows(db, [{}, {}, {}])) as [string, string, string];
      listings.push(kept, a, b);
      const { userId } = await seedSeeker(db);
      users.push(userId);
      await setDisposition(db, { userId, listingId: kept, state: 'saved', source: 'seek' });

      const results = await Promise.allSettled([
        setDisposition(db, { userId, listingId: a, state: 'saved', source: 'seek' }),
        setDisposition(db, { userId, listingId: b, state: 'saved', source: 'seek' }),
      ]);
      const denied = results.filter((r) => r.status === 'rejected');
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(denied).toHaveLength(1);
      const reason = denied[0]?.status === 'rejected' ? denied[0].reason : null;
      expect(reason).toBeInstanceOf(AppError);
      expect((reason as AppError).details).toEqual({ reason: 'saved_limit' });

      const [count] = await queryRows<{ n: number }>(
        db,
        sql`select count(*)::int as n from app.listing_dispositions
          where user_id = ${userId}::uuid and state = 'saved'`,
      );
      expect(count?.n).toBe(2);
    } finally {
      if (previous) {
        await db.execute(
          sql`update app.settings set value = ${previous.value}::jsonb
            where key = 'discovery.saved_jobs_per_user'`,
        );
      } else {
        await db.execute(
          sql`delete from app.settings where key = 'discovery.saved_jobs_per_user'`,
        );
      }
    }
  });
});
