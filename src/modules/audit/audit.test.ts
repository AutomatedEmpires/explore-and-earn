import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows, withTx } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record, redact, searchAudit, type AuditEventInput } from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

// The table is append-only, so each test uses its own action names instead of cleaning up.
function uniqueAction(name: string): string {
  return `test.${name}.${newId()}`;
}

/** The messages of a rejected query and its causes (Drizzle wraps the driver's error). */
async function dbError(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const messages: string[] = [];
  for (let e: unknown = err; e instanceof Error; e = e.cause) messages.push(e.message);
  return messages.join('\n');
}

function event(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    actorType: 'system',
    actorId: null,
    action: 'test.event',
    subjectType: 'test_item',
    subjectId: 'item-1',
    ...overrides,
  };
}

describe('record', () => {
  it('stores every field and redacts secrets in data', async () => {
    const action = uniqueAction('stored');
    const actorId = newId();
    const orgId = newId();
    await record(t.db, {
      actorType: 'operator',
      actorId,
      orgId,
      action,
      subjectType: 'setting',
      subjectId: 'limits.x',
      data: { before: 1, after: 2, password: 'hunter2' },
      requestId: 'req-1',
      ipHash: 'abc123',
    });

    const { items } = await searchAudit(t.db, { action });
    expect(items).toHaveLength(1);
    const [e] = items;
    expect(e).toMatchObject({
      actorType: 'operator',
      actorId,
      orgId,
      action,
      subjectType: 'setting',
      subjectId: 'limits.x',
      data: { before: 1, after: 2, password: '[redacted]' },
      requestId: 'req-1',
      ipHash: 'abc123',
    });
    expect(e?.createdAt).toBeInstanceOf(Date);
  });

  it('stores null for omitted optional fields', async () => {
    const action = uniqueAction('minimal');
    await record(t.db, event({ action, subjectId: null }));
    const [e] = (await searchAudit(t.db, { action })).items;
    expect(e).toMatchObject({ orgId: null, subjectId: null, data: null, requestId: null });
  });

  it('writes in the caller transaction', async () => {
    const action = uniqueAction('rolled-back');
    await expect(
      withTx(t.db, async (tx) => {
        await record(tx, event({ action }));
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await searchAudit(t.db, { action })).items).toHaveLength(0);
  });

  it('cannot be updated, deleted or truncated', async () => {
    const action = uniqueAction('immutable');
    await record(t.db, event({ action }));

    expect(
      await dbError(
        t.db.execute(sql`update app.audit_events set subject_id = 'x' where action = ${action}`),
      ),
    ).toMatch(/append-only: UPDATE/);
    expect(
      await dbError(t.db.execute(sql`delete from app.audit_events where action = ${action}`)),
    ).toMatch(/append-only: DELETE/);
    expect(await dbError(t.db.execute(sql`truncate app.audit_events`))).toMatch(
      /append-only: TRUNCATE/,
    );

    const rows = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.audit_events where action = ${action} and subject_id = 'item-1'`,
    );
    expect(rows[0]?.n).toBe(1);
  });
});

describe('redact', () => {
  it('replaces secret-looking keys at any depth', () => {
    expect(redact({ a: 1, apiKey: 'x', nested: { token: 'y' } })).toEqual({
      a: 1,
      apiKey: '[redacted]',
      nested: { token: '[redacted]' },
    });
  });

  it('matches secret, token, password and api key spellings, case-insensitively', () => {
    expect(
      redact({
        clientSecret: 1,
        ACCESS_TOKEN: 2,
        Password: 3,
        api_key: 4,
        'api-key': 5,
        APIKEY: 6,
        keep: 7,
      }),
    ).toEqual({
      clientSecret: '[redacted]',
      ACCESS_TOKEN: '[redacted]',
      Password: '[redacted]',
      api_key: '[redacted]',
      'api-key': '[redacted]',
      APIKEY: '[redacted]',
      keep: 7,
    });
  });

  it('walks arrays and replaces a secret key whose value is an object', () => {
    expect(
      redact({ list: [{ token: 'a', id: 1 }, 'plain', [{ password: 'b' }]], secrets: { x: 1 } }),
    ).toEqual({
      list: [{ token: '[redacted]', id: 1 }, 'plain', [{ password: '[redacted]' }]],
      secrets: '[redacted]',
    });
  });

  it('does not change its input and keeps values like dates', () => {
    const when = new Date('2026-01-01T00:00:00Z');
    const input = { token: 'x', when, nested: { password: 'y' } };
    const out = redact(input);
    expect(input).toEqual({ token: 'x', when, nested: { password: 'y' } });
    expect(out.when).toBe(when);
  });

  it('survives circular references', () => {
    const input: Record<string, unknown> = { a: 1 };
    input.self = input;
    expect(redact(input)).toEqual({ a: 1, self: '[circular]' });
  });

  it('keeps a shared, non-circular object in both places', () => {
    const shared = { token: 'x', n: 1 };
    expect(redact({ a: shared, b: shared })).toEqual({
      a: { token: '[redacted]', n: 1 },
      b: { token: '[redacted]', n: 1 },
    });
  });
});

describe('searchAudit', () => {
  it('pages newest first with a cursor', async () => {
    const action = uniqueAction('paged');
    for (const subjectId of ['first', 'second', 'third']) {
      await record(t.db, event({ action, subjectId }));
    }

    const page1 = await searchAudit(t.db, { action, limit: 2 });
    expect(page1.items.map((e) => e.subjectId)).toEqual(['third', 'second']);
    expect(page1.nextBefore).not.toBeNull();

    const page2 = await searchAudit(t.db, { action, limit: 2, before: page1.nextBefore ?? '' });
    expect(page2.items.map((e) => e.subjectId)).toEqual(['first']);
    expect(page2.nextBefore).toBeNull();
  });

  it('returns a null cursor when the page is exactly full', async () => {
    const action = uniqueAction('exact');
    await record(t.db, event({ action }));
    await record(t.db, event({ action }));
    expect((await searchAudit(t.db, { action, limit: 2 })).nextBefore).toBeNull();
  });

  it('filters by actor and subject', async () => {
    const action = uniqueAction('filters');
    const alice = newId();
    const bob = newId();
    await record(t.db, event({ action, actorType: 'user', actorId: alice, subjectId: 's1' }));
    await record(t.db, event({ action, actorType: 'user', actorId: bob, subjectId: 's1' }));
    await record(t.db, event({ action, actorType: 'user', actorId: alice, subjectId: 's2' }));
    await record(
      t.db,
      event({ action, actorType: 'user', actorId: alice, subjectType: 'other', subjectId: 's1' }),
    );

    const byActor = await searchAudit(t.db, { action, actorId: alice });
    expect(byActor.items).toHaveLength(3);

    const bySubject = await searchAudit(t.db, {
      action,
      subjectType: 'test_item',
      subjectId: 's1',
    });
    expect(bySubject.items.map((e) => e.actorId).sort()).toEqual([alice, bob].sort());

    const byType = await searchAudit(t.db, { action, subjectType: 'other' });
    expect(byType.items).toHaveLength(1);
  });

  it('filters by a [from, to) time range', async () => {
    const action = uniqueAction('range');
    for (const at of ['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z']) {
      // Back-dated rows: record() always stamps now(), and the table only forbids changes.
      await t.db.execute(sql`
        insert into app.audit_events (id, actor_type, action, subject_type, subject_id, created_at)
        values (${newId()}, 'system', ${action}, 'test_item', ${at}, ${at}::timestamptz)
      `);
    }

    const result = await searchAudit(t.db, {
      action,
      from: new Date('2026-01-02T00:00:00Z'),
      to: new Date('2026-01-03T00:00:00Z'),
    });
    expect(result.items.map((e) => e.subjectId)).toEqual(['2026-01-02T00:00:00Z']);
  });

  it('caps the page size', async () => {
    const action = uniqueAction('cap');
    await record(t.db, event({ action }));
    const result = await searchAudit(t.db, { action, limit: 10_000 });
    expect(result.items).toHaveLength(1);
    await expect(searchAudit(t.db, { action, limit: 0 })).resolves.toMatchObject({
      items: [expect.anything()],
    });
  });

  it('rejects a malformed cursor with bad_request', async () => {
    const err = await searchAudit(t.db, { before: 'not-a-uuid' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('bad_request');
  });
});

describe('the audit_events table', () => {
  it('rejects an unknown actor type', async () => {
    await expect(
      record(t.db, event({ actorType: 'robot' as AuditEventInput['actorType'] })),
    ).rejects.toThrow();
  });
});
