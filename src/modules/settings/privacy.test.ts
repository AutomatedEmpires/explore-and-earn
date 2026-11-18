import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedOperator } from '@tests/helpers/sp8';
import { privacyHandler } from './privacy';

const NOW = new Date('2026-11-18T12:00:00Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const erase = (s: PrivacySubject, holds: HoldScope[] = []) =>
  withTx(t.db, (tx) => privacyHandler.erase(tx, s, { requestId: newId(), now: NOW, holds }));

async function seedSetting(key: string, updatedBy: string): Promise<void> {
  await t.db.execute(sql`
    insert into app.settings (key, value, updated_by) values (${key}, '7'::jsonb, ${updatedBy})
  `);
}

const setting = async (key: string) =>
  (
    await queryRows<{ value: unknown; updated_by: string | null }>(
      t.db,
      sql`select value, updated_by::text from app.settings where key = ${key}`,
    )
  )[0];

describe('settings privacy handler', () => {
  it('forgets who last changed a value and keeps the value', async () => {
    const leaving = await seedOperator(t.db);
    const staying = await seedOperator(t.db);
    await seedSetting('test.one', leaving.userId);
    await seedSetting('test.two', staying.userId);
    const subject = { kind: 'user' as const, userId: leaving.userId };

    expect(await erase(subject)).toEqual({ erased: 1, retained: [] });
    expect(await setting('test.one')).toEqual({ value: 7, updated_by: null });
    expect(await setting('test.two')).toEqual({ value: 7, updated_by: staying.userId });
    expect(await erase(subject)).toEqual({ erased: 0, retained: [] });
  });

  it('keeps the link under a hold on everything', async () => {
    const operator = await seedOperator(t.db);
    await seedSetting('test.held', operator.userId);
    expect(await erase({ kind: 'user', userId: operator.userId }, ['all'])).toEqual({
      erased: 0,
      retained: [{ table: 'settings', reason: 'legal_hold', until: null }],
    });
    expect(await setting('test.held')).toEqual({ value: 7, updated_by: operator.userId });
  });

  it('has nothing for an organization, and exports nothing', async () => {
    const org = await seedHostOrg(t.db);
    expect(await erase({ kind: 'org', orgId: org.orgId })).toEqual({ erased: 0, retained: [] });
    expect(
      await privacyHandler.exportData(t.db, { kind: 'user', userId: org.owner.userId }),
    ).toEqual({ records: {}, files: [] });
  });
});
