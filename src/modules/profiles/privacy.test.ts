import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { seedUser } from '@tests/helpers/sp4';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { addEntry } from './entries';
import { privacyHandler } from './privacy';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function profileCount(userId: string): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    t.db,
    sql`select count(*)::int as n from app.seeker_profiles where user_id = ${userId}`,
  );
  return row?.n ?? 0;
}

describe('profile privacy', () => {
  it('exports the experience and erases the profile, unless every record is on hold', async () => {
    const user = await seedUser(t.db, { accountType: 'seeker' });
    await addEntry(t.db, user.id, 'experience', {
      employer: 'Harbor Co',
      title: 'Deckhand',
      startMonth: '2024-06',
    });
    const exported = await privacyHandler.exportData(t.db, { kind: 'user', userId: user.id });
    expect(JSON.stringify(exported.records.experience)).toContain('Deckhand');

    const held = await t.db.transaction((tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: user.id }, {
        requestId: 'hold',
        now: new Date(),
        holds: ['all'],
      }),
    );
    expect(held).toEqual({
      erased: 0,
      retained: [{ table: 'seeker_profiles', reason: 'legal_hold', until: null }],
    });
    expect(await profileCount(user.id)).toBe(1);
    const [entries] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.seeker_experiences where user_id = ${user.id}`,
    );
    expect(entries?.n).toBe(1);

    const applications = await t.db.transaction((tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: user.id }, {
        requestId: 'apps',
        now: new Date(),
        holds: ['applications'],
      }),
    );
    expect(applications.erased).toBeGreaterThan(0);
    expect(applications.retained).toEqual([]);
    expect(await profileCount(user.id)).toBe(0);

    const again = await t.db.transaction((tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId: user.id }, {
        requestId: 'again',
        now: new Date(),
        holds: [],
      }),
    );
    expect(again).toEqual({ erased: 0, retained: [] });
  });
});
