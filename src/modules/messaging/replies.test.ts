import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOT_SELECTED_DEFAULT } from '@/lib/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { createSavedReply, getNotSelectedMessage } from './replies';
import { seedHostOrg, seedMember } from './test-fixture';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

describe('saved replies', () => {
  it('refuses the 21st saved reply', async () => {
    const org = await seedHostOrg(t.db);
    for (let n = 0; n < 20; n += 1) {
      await createSavedReply(t.db, org.owner.ctx, { title: `Reply ${n}`, body: 'Thanks for applying.' });
    }
    await expect(
      createSavedReply(t.db, org.owner.ctx, { title: 'One more', body: 'Thanks again.' }),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'limit_reached' } });
  });

  it('returns the default not-selected message until an owner or admin sets one', async () => {
    const org = await seedHostOrg(t.db);
    await expect(getNotSelectedMessage(t.db, org.orgId)).resolves.toEqual({
      body: NOT_SELECTED_DEFAULT,
      isDefault: true,
    });
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    expect(recruiter.ctx.role).toBe('recruiter');
  });
});
