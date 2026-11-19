// The Global Privacy Control record (legal review 4.5, P0 item 18): a signed-in request that
// carries Sec-GPC: 1 stamps users.analytics_opt_out_at once, so jobs that run with no request
// (SP8 W5, #149) can honor the opt-out too.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { isAnalyticsOptedOut, recordAnalyticsOptOut } from './analytics-opt-out';
import { syncClerkUser } from './sync';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`truncate app.users cascade`);
});

async function newUser(): Promise<string> {
  return syncClerkUser(t.db, { id: 'user_gpc', public_metadata: {}, updated_at: Date.now() });
}

async function stampedAt(id: string): Promise<string | null> {
  const [row] = await queryRows<{ at: string | null }>(
    t.db,
    sql`select analytics_opt_out_at::text as at from app.users where id = ${id}`,
  );
  return row?.at ?? null;
}

describe('recordAnalyticsOptOut', () => {
  it('stamps the user once and keeps the first time', async () => {
    const id = await newUser();
    expect(await isAnalyticsOptedOut(t.db, id)).toBe(false);

    expect(await recordAnalyticsOptOut(t.db, id)).toBe(true);
    const first = await stampedAt(id);
    expect(first).not.toBeNull();
    expect(await isAnalyticsOptedOut(t.db, id)).toBe(true);

    expect(await recordAnalyticsOptOut(t.db, id)).toBe(false);
    expect(await stampedAt(id)).toBe(first);
  });

  it('does nothing for an unknown user', async () => {
    expect(await recordAnalyticsOptOut(t.db, '00000000-0000-7000-8000-00000000abcd')).toBe(false);
    expect(await isAnalyticsOptedOut(t.db, '00000000-0000-7000-8000-00000000abcd')).toBe(false);
  });
});
