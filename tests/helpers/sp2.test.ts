// The shared SP2 test helpers seed rows that satisfy every Foundation constraint.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMediaInfo, MEDIA_STATUSES } from '@/modules/media';
import { createTestDb, type TestDb } from './db';
import { seedHostOrg, seedMedia } from './sp2';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

describe('seedMedia', () => {
  it.each(MEDIA_STATUSES)('seeds a %s media row', async (status) => {
    const org = await seedHostOrg(t.db);
    const id = await seedMedia(t.db, org.orgId, 'housing_photo', status);
    const info = (await getMediaInfo(t.db, [id])).get(id);
    expect(info).toMatchObject({ ownerOrgId: org.orgId, kind: 'housing_photo', status });
  });

  it('defaults to approved', async () => {
    const org = await seedHostOrg(t.db);
    const id = await seedMedia(t.db, org.orgId, 'cover');
    expect((await getMediaInfo(t.db, [id])).get(id)?.status).toBe('approved');
  });
});
