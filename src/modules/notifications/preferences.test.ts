import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { listPreferenceRows, updatePreference } from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function newUser(): Promise<string> {
  const id = newId();
  await t.db.execute(sql`insert into app.users (id, clerk_user_id) values (${id}, ${id})`);
  return id;
}

describe('listPreferenceRows', () => {
  it('gives a new user 16 rows, all on, with security and billing locked', async () => {
    const rows = await listPreferenceRows(t.db, await newUser());
    expect(rows).toHaveLength(16);
    expect(rows.every((r) => r.enabled)).toBe(true);
    expect(rows.filter((r) => r.locked).map((r) => `${r.category}:${r.channel}`)).toEqual([
      'security:email',
      'security:push',
      'billing:email',
      'billing:push',
    ]);
    expect(rows.some((r) => (r.category as string) === 'operator')).toBe(false);
  });
});

describe('updatePreference', () => {
  it('turns one switch off', async () => {
    const user = await newUser();
    await updatePreference(t.db, user, { category: 'account', channel: 'email', enabled: false });
    const rows = await listPreferenceRows(t.db, user);
    expect(rows.find((r) => r.category === 'account' && r.channel === 'email')?.enabled).toBe(
      false,
    );
    expect(rows.find((r) => r.category === 'account' && r.channel === 'push')?.enabled).toBe(true);
  });

  it('refuses a locked category with reason locked', async () => {
    const user = await newUser();
    await expect(
      updatePreference(t.db, user, { category: 'security', channel: 'email', enabled: false }),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'locked' } });
  });
});
