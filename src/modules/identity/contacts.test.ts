import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { getUserContacts } from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function newUser(email: string, deleted = false): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, deleted_at)
    values (${id}, ${`user_${id}`}, ${email}, ${deleted ? sql`now()` : sql`null`})
  `);
  return id;
}

describe('getUserContacts', () => {
  it('returns each known user email and whether they were deleted', async () => {
    const live = await newUser('maya@example.test');
    const gone = await newUser('gone@example.test', true);

    const contacts = await getUserContacts(t.db, [live, gone, newId(), 'not-a-uuid']);

    expect([...contacts.keys()].sort()).toEqual([live, gone].sort());
    expect(contacts.get(live)).toEqual({ email: 'maya@example.test', deleted: false });
    expect(contacts.get(gone)).toEqual({ email: 'gone@example.test', deleted: true });
    expect((await getUserContacts(t.db, [])).size).toBe(0);
  });
});
