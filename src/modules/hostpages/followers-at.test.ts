import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, seedSeeker } from '../../../tests/helpers/sp2';
import { countFollowersAt } from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

describe('countFollowersAt', () => {
  it('counts follows created at or before the instant', async () => {
    const { orgId } = await seedHostOrg(t.db);
    const early = await seedSeeker(t.db);
    const late = await seedSeeker(t.db);
    const at = new Date('2027-06-15T00:00:00Z');
    const before = new Date('2027-06-13T00:00:00Z');
    const after = new Date('2027-06-16T00:00:00Z');
    await t.db.execute(sql`
      insert into app.host_follows (user_id, org_id, created_at)
      values (${early.userId}, ${orgId}, ${before}), (${late.userId}, ${orgId}, ${after})
    `);
    expect(await countFollowersAt(t.db, orgId, at)).toBe(1);
  });
});
