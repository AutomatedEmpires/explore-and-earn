import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedSeeker } from '@tests/helpers/sp8';
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

async function seedEvent(status: string, payload: unknown): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.outbox (id, topic, payload, status)
    values (${id}, 'test.topic', ${JSON.stringify(payload)}::jsonb, ${status})
  `);
  return id;
}

const exists = async (id: string) =>
  (await queryRows(t.db, sql`select 1 from app.outbox where id = ${id}`)).length === 1;

describe('jobs privacy handler', () => {
  it('deletes settled events that name the person or their email, and nothing else', async () => {
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    const email = seeker.user.email ?? '';
    const done = await seedEvent('done', { userId: seeker.userId });
    const dead = await seedEvent('dead', { nested: { ids: [seeker.userId] } });
    const mailed = await seedEvent('done', { to: email.toUpperCase(), template: 'HostNotice' });
    const pending = await seedEvent('pending', { userId: seeker.userId });
    const processing = await seedEvent('processing', { userId: seeker.userId });
    const theirs = await seedEvent('done', { userId: other.userId, to: other.user.email });
    const subject = { kind: 'user' as const, userId: seeker.userId };

    expect(await erase(subject)).toEqual({ erased: 3, retained: [] });
    expect(await exists(done)).toBe(false);
    expect(await exists(dead)).toBe(false);
    expect(await exists(mailed)).toBe(false);
    expect(await exists(pending)).toBe(true);
    expect(await exists(processing)).toBe(true);
    expect(await exists(theirs)).toBe(true);

    expect(await erase(subject)).toEqual({ erased: 0, retained: [] });
  });

  it('matches an email literally, so a wildcard character matches nothing extra', async () => {
    const seeker = await seedSeeker(t.db, { email: 'a_b%c@example.test' });
    const lookalike = await seedEvent('done', { to: 'aXbYYc@example.test' });
    await erase({ kind: 'user', userId: seeker.userId });
    expect(await exists(lookalike)).toBe(true);
  });

  it('deletes settled events that name the organization', async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Untouched Outfitters' });
    const done = await seedEvent('done', { orgId: org.orgId });
    const theirs = await seedEvent('done', { orgId: other.orgId });
    expect(await erase({ kind: 'org', orgId: org.orgId })).toEqual({ erased: 1, retained: [] });
    expect(await exists(done)).toBe(false);
    expect(await exists(theirs)).toBe(true);
  });

  it('erases nothing under a hold on everything and reports the outbox', async () => {
    const seeker = await seedSeeker(t.db);
    const clean = await seedSeeker(t.db);
    const done = await seedEvent('done', { userId: seeker.userId });
    expect(await erase({ kind: 'user', userId: seeker.userId }, ['all'])).toEqual({
      erased: 0,
      retained: [{ table: 'outbox', reason: 'legal_hold', until: null }],
    });
    expect(await exists(done)).toBe(true);
    expect(await erase({ kind: 'user', userId: clean.userId }, ['all'])).toEqual({
      erased: 0,
      retained: [],
    });
  });

  it('exports nothing', async () => {
    const seeker = await seedSeeker(t.db);
    expect(
      await privacyHandler.exportData(t.db, { kind: 'user', userId: seeker.userId }),
    ).toEqual({ records: {}, files: [] });
  });
});
