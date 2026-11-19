import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedSeeker } from '@tests/helpers/sp8';
import { privacyHandler } from './privacy';
import { record } from './record';

const NOW = new Date('2026-11-18T12:00:00Z');
const KEPT = [{ table: 'audit_events', reason: 'audit', until: null }];

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const erase = (s: PrivacySubject, holds: HoldScope[] = []) =>
  withTx(t.db, (tx) => privacyHandler.erase(tx, s, { requestId: newId(), now: NOW, holds }));

const rows = () =>
  queryRows(t.db, sql`select id, actor_id, org_id, action, data from app.audit_events order by id`);

describe('audit privacy handler', () => {
  it('never touches the audit log, for a person or an organization, hold or not', async () => {
    const seeker = await seedSeeker(t.db);
    const org = await seedHostOrg(t.db);
    await record(t.db, {
      actorType: 'user',
      actorId: seeker.userId,
      action: 'test.happened',
      subjectType: 'user',
      subjectId: seeker.userId,
      data: { count: 1 },
    });
    await record(t.db, {
      actorType: 'system',
      actorId: null,
      orgId: org.orgId,
      action: 'test.happened',
      subjectType: 'organization',
      subjectId: org.orgId,
    });
    const before = await rows();
    expect(before).toHaveLength(2);

    const user = { kind: 'user' as const, userId: seeker.userId };
    expect(await erase(user)).toEqual({ erased: 0, retained: KEPT });
    expect(await erase(user)).toEqual({ erased: 0, retained: KEPT });
    expect(await erase(user, ['all'])).toEqual({ erased: 0, retained: KEPT });
    expect(await erase({ kind: 'org', orgId: org.orgId })).toEqual({ erased: 0, retained: KEPT });
    expect(await rows()).toEqual(before);
  });

  it('exports nothing', async () => {
    const seeker = await seedSeeker(t.db);
    expect(
      await privacyHandler.exportData(t.db, { kind: 'user', userId: seeker.userId }),
    ).toEqual({ records: {}, files: [] });
  });
});
