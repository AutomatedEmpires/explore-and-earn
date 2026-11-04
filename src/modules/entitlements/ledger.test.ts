import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg } from '../../../tests/helpers/sp2';
import { queryRows } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { searchAudit } from '@/modules/audit';
import {
  consume,
  endGrant,
  getBalance,
  grant,
  listOpenGrants,
  privacyHandlers,
  reverse,
  type Actor,
  type EntitlementKind,
  type GrantSource,
} from './index';

let t: TestDb;
const SYSTEM: Actor = { type: 'system', id: null };

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const fromNow = (ms: number) => new Date(Date.now() + ms);

async function newOrg(): Promise<{ orgId: string; ownerId: string }> {
  const org = await seedHostOrg(t.db);
  return { orgId: org.orgId, ownerId: org.owner.userId };
}

async function credits(
  orgId: string,
  quantity: number,
  o: {
    validFrom?: Date;
    validUntil?: Date | null;
    kind?: EntitlementKind;
    source?: GrantSource;
    key?: string;
    actor?: Actor;
  } = {},
): Promise<string> {
  const { grantId } = await grant(t.db, {
    orgId,
    kind: o.kind ?? 'invite_credit',
    quantity,
    source: o.source ?? 'plan',
    sourceRef: 'sub_test',
    validFrom: o.validFrom ?? fromNow(-DAY),
    validUntil: o.validUntil ?? null,
    idempotencyKey: o.key ?? `test:${newId()}`,
    actor: o.actor ?? SYSTEM,
  });
  return grantId;
}

function take(orgId: string, key: string, quantity = 1, actor: Actor = SYSTEM) {
  return consume(t.db, {
    orgId,
    kind: 'invite_credit',
    quantity,
    subjectType: 'candidate_invite',
    subjectId: newId(),
    idempotencyKey: key,
    actor,
  });
}

async function balance(orgId: string, now?: Date): Promise<number> {
  return (await getBalance(t.db, orgId, 'invite_credit', now)).balance;
}

async function consumptionRows(orgId: string) {
  return queryRows<{
    id: string;
    grant_id: string;
    quantity: number;
    idempotency_key: string;
    reversed_at: string | null;
    reversal_reason: string | null;
  }>(
    t.db,
    sql`
      select id, grant_id, quantity, idempotency_key, reversed_at, reversal_reason
      from app.entitlement_consumptions where org_id = ${orgId} order by idempotency_key
    `,
  );
}

/** The messages of a rejected promise and its causes (Drizzle wraps the driver's error). */
async function errorText(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const messages: string[] = [];
  for (let e: unknown = err; e instanceof Error; e = e.cause) messages.push(e.message);
  return messages.join('\n');
}

async function appError(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

describe('consume', () => {
  it('consumes once for the same key, and both calls return the same consumptionId', async () => {
    const { orgId } = await newOrg();
    await credits(orgId, 10);

    const first = await take(orgId, 'invite:a');
    const second = await take(orgId, 'invite:a');

    expect(first).toEqual({ ok: true, consumptionId: expect.any(String), remaining: 9 });
    expect(second).toEqual(first);
    expect(await balance(orgId)).toBe(9);
    expect(await consumptionRows(orgId)).toHaveLength(1);
  });

  it('returns insufficient and writes nothing when the balance is too low', async () => {
    const { orgId } = await newOrg();
    await credits(orgId, 1);

    expect(await take(orgId, 'invite:b', 2)).toEqual({
      ok: false,
      reason: 'insufficient',
      remaining: 1,
    });
    expect(await consumptionRows(orgId)).toHaveLength(0);
    expect(await balance(orgId)).toBe(1);
  });

  it('draws from the grant that expires first, before an open-ended one', async () => {
    const { orgId } = await newOrg();
    const open = await credits(orgId, 5, { validFrom: fromNow(-2 * DAY) });
    const expiring = await credits(orgId, 10, { validUntil: fromNow(27 * DAY) });

    const result = await take(orgId, 'invite:c', 3);
    expect(result.ok).toBe(true);
    const rows = await consumptionRows(orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ grant_id: expiring, quantity: 3 });
    expect(rows[0]?.grant_id).not.toBe(open);
  });

  it('splits a consumption across grants, keyed <key> and <key>#2', async () => {
    const { orgId } = await newOrg();
    const expiring = await credits(orgId, 10, { validUntil: fromNow(27 * DAY) });
    const open = await credits(orgId, 5);

    const result = await take(orgId, 'invite:d', 12);
    const rows = await consumptionRows(orgId);
    expect(rows).toEqual([
      expect.objectContaining({ idempotency_key: 'invite:d', grant_id: expiring, quantity: 10 }),
      expect.objectContaining({ idempotency_key: 'invite:d#2', grant_id: open, quantity: 2 }),
    ]);
    expect(result).toEqual({ ok: true, consumptionId: rows[0]?.id, remaining: 3 });
    expect(await take(orgId, 'invite:d', 12)).toEqual(result);
  });

  it('orders grants with the same expiry by valid_from', async () => {
    const { orgId } = await newOrg();
    const until = fromNow(10 * DAY);
    const newer = await credits(orgId, 2, { validFrom: fromNow(-HOUR), validUntil: until });
    const older = await credits(orgId, 2, { validFrom: fromNow(-DAY), validUntil: until });

    await take(orgId, 'invite:e', 3);
    const rows = await consumptionRows(orgId);
    expect(rows.map((r) => [r.grant_id, r.quantity])).toEqual([
      [older, 2],
      [newer, 1],
    ]);
  });

  it('rejects a quantity that is not a positive integer, and a key ending in #<number>', async () => {
    const { orgId } = await newOrg();
    await credits(orgId, 10);
    expect((await appError(take(orgId, 'invite:f', 0))).code).toBe('bad_request');
    expect((await appError(take(orgId, 'invite:g', 1.5))).code).toBe('bad_request');
    expect((await appError(take(orgId, 'invite:h#2'))).code).toBe('bad_request');
    expect(await consumptionRows(orgId)).toHaveLength(0);
  });

  it('refuses a key that another organization already used', async () => {
    const a = await newOrg();
    const b = await newOrg();
    await credits(a.orgId, 5);
    await credits(b.orgId, 5);
    await take(a.orgId, 'invite:shared');
    expect((await appError(take(b.orgId, 'invite:shared'))).code).toBe('conflict');
    expect(await balance(b.orgId)).toBe(5);
  });

  it('works inside a caller transaction and rolls back with it', async () => {
    const { orgId } = await newOrg();
    await credits(orgId, 4);
    await expect(
      t.db.transaction(async (tx) => {
        const r = await consume(tx, {
          orgId,
          kind: 'invite_credit',
          subjectType: 'candidate_invite',
          subjectId: 'c1',
          idempotencyKey: 'invite:tx',
          actor: SYSTEM,
        });
        expect(r).toMatchObject({ ok: true, remaining: 3 });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await balance(orgId)).toBe(4);
    expect(await consumptionRows(orgId)).toHaveLength(0);
  });
});

describe('getBalance', () => {
  it('does not count a grant whose validUntil is 1 ms before now', async () => {
    const { orgId } = await newOrg();
    const now = new Date();
    await credits(orgId, 5, { validUntil: new Date(now.getTime() - 1) });
    await credits(orgId, 3);

    expect(await getBalance(t.db, orgId, 'invite_credit', now)).toEqual({
      balance: 3,
      resetsAt: null,
    });
  });

  it('does not count a grant that starts after now', async () => {
    const { orgId } = await newOrg();
    await credits(orgId, 5, { validFrom: fromNow(DAY) });
    expect(await balance(orgId)).toBe(0);
  });

  it('reports resetsAt as the earliest expiry among grants with something left', async () => {
    const { orgId } = await newOrg();
    const soon = fromNow(5 * DAY);
    const later = fromNow(20 * DAY);
    await credits(orgId, 2, { validUntil: soon });
    await credits(orgId, 4, { validUntil: later });
    await credits(orgId, 1);

    expect(await getBalance(t.db, orgId, 'invite_credit')).toEqual({ balance: 7, resetsAt: soon });
    await take(orgId, 'invite:spend-soon', 2);
    expect(await getBalance(t.db, orgId, 'invite_credit')).toEqual({
      balance: 5,
      resetsAt: later,
    });
  });

  it('is zero with no grants', async () => {
    const { orgId } = await newOrg();
    expect(await getBalance(t.db, orgId, 'invite_credit')).toEqual({ balance: 0, resetsAt: null });
  });
});

describe('reverse', () => {
  it('restores the balance once; a second reverse changes nothing', async () => {
    const { orgId } = await newOrg();
    await credits(orgId, 10);
    const result = await take(orgId, 'invite:r');
    if (!result.ok) throw new Error('expected ok');
    expect(await balance(orgId)).toBe(9);

    await reverse(t.db, result.consumptionId, 'invite_withdrawn', SYSTEM);
    expect(await balance(orgId)).toBe(10);
    const [row] = await consumptionRows(orgId);
    expect(row).toMatchObject({ reversal_reason: 'invite_withdrawn' });
    const reversedAt = row?.reversed_at;
    expect(reversedAt).toBeTruthy();

    await reverse(t.db, result.consumptionId, 'again', SYSTEM);
    expect(await balance(orgId)).toBe(10);
    expect((await consumptionRows(orgId))[0]).toMatchObject({
      reversed_at: reversedAt,
      reversal_reason: 'invite_withdrawn',
    });
    const { items } = await searchAudit(t.db, { action: 'entitlements.reversed', orgId });
    expect(items).toHaveLength(1);
  });

  it('reverses every row of a split consumption, from either row', async () => {
    const { orgId } = await newOrg();
    await credits(orgId, 2, { validUntil: fromNow(3 * DAY) });
    await credits(orgId, 5);
    await take(orgId, 'invite:split', 4);
    const rows = await consumptionRows(orgId);
    expect(rows).toHaveLength(2);
    expect(await balance(orgId)).toBe(3);

    await reverse(t.db, rows[1]?.id ?? '', 'withdrawn', SYSTEM);
    expect(await balance(orgId)).toBe(7);
    expect((await consumptionRows(orgId)).every((r) => r.reversed_at !== null)).toBe(true);
  });

  it('throws not_found for an unknown consumption', async () => {
    expect((await appError(reverse(t.db, newId(), 'x', SYSTEM))).code).toBe('not_found');
  });
});

describe('grant', () => {
  it('is idempotent by key, even after the grant was ended', async () => {
    const { orgId } = await newOrg();
    const input = {
      orgId,
      kind: 'listing_slot' as const,
      quantity: 12,
      source: 'plan' as const,
      sourceRef: 'sub_1',
      idempotencyKey: `plan:sub_1:listing_slot:12:${newId()}`,
      actor: SYSTEM,
    };
    const first = await grant(t.db, input);
    expect(first).toEqual({ grantId: expect.any(String), created: true });
    expect(await grant(t.db, input)).toEqual({ grantId: first.grantId, created: false });

    await endGrant(t.db, first.grantId, new Date(), SYSTEM);
    expect(await grant(t.db, input)).toEqual({ grantId: first.grantId, created: false });

    const rows = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.entitlement_grants where org_id = ${orgId}`,
    );
    expect(rows[0]?.n).toBe(1);
    expect(await listOpenGrants(t.db, orgId, {})).toEqual([]);
  });

  it('rejects a quantity of 0 with bad_request', async () => {
    const { orgId } = await newOrg();
    const err = await appError(
      grant(t.db, {
        orgId,
        kind: 'seat',
        quantity: 0,
        source: 'operator',
        sourceRef: 'op',
        idempotencyKey: `zero:${newId()}`,
        actor: SYSTEM,
      }),
    );
    expect(err.code).toBe('bad_request');
  });

  it('rejects a validUntil before validFrom with bad_request', async () => {
    const { orgId } = await newOrg();
    const err = await appError(
      grant(t.db, {
        orgId,
        kind: 'seat',
        quantity: 1,
        source: 'operator',
        sourceRef: 'op',
        validFrom: fromNow(0),
        validUntil: fromNow(-DAY),
        idempotencyKey: `backwards:${newId()}`,
        actor: SYSTEM,
      }),
    );
    expect(err.code).toBe('bad_request');
  });

  it('refuses a key that another organization already used', async () => {
    const a = await newOrg();
    const b = await newOrg();
    const key = `shared:${newId()}`;
    await credits(a.orgId, 1, { key });
    expect((await appError(credits(b.orgId, 1, { key }))).code).toBe('conflict');
  });
});

describe('endGrant and listOpenGrants', () => {
  it('excludes the grant from `at` on', async () => {
    const { orgId } = await newOrg();
    const id = await credits(orgId, 10);
    const at = fromNow(HOUR);
    await endGrant(t.db, id, at, SYSTEM);

    expect(await balance(orgId, new Date(at.getTime() - 1))).toBe(10);
    expect(await balance(orgId, at)).toBe(0);
  });

  it('never lengthens a grant', async () => {
    const { orgId } = await newOrg();
    const until = fromNow(DAY);
    const id = await credits(orgId, 3, { validUntil: until });
    await endGrant(t.db, id, fromNow(10 * DAY), SYSTEM);
    const [g] = await listOpenGrants(t.db, orgId, {});
    expect(g?.validUntil).toEqual(until);
    const { items } = await searchAudit(t.db, { action: 'entitlements.grant_ended', orgId });
    expect(items).toHaveLength(0);
  });

  it('throws not_found for an unknown grant', async () => {
    expect((await appError(endGrant(t.db, newId(), new Date(), SYSTEM))).code).toBe('not_found');
  });

  it('lists open grants filtered by source and kind, omitting ended ones', async () => {
    const { orgId } = await newOrg();
    const until = fromNow(30 * DAY);
    const keep = await credits(orgId, 5, { kind: 'seat', source: 'plan', validUntil: until });
    const ended = await credits(orgId, 5, { kind: 'seat', source: 'plan' });
    await endGrant(t.db, ended, new Date(), SYSTEM);
    await credits(orgId, 2, { kind: 'seat', source: 'operator' });
    await credits(orgId, 10, { kind: 'listing_slot', source: 'plan' });
    await credits(orgId, 3, { kind: 'seat', source: 'plan', validFrom: fromNow(DAY) });

    expect(await listOpenGrants(t.db, orgId, { source: 'plan', kind: 'seat' })).toEqual([
      { id: keep, kind: 'seat', quantity: 5, sourceRef: 'sub_test', validUntil: until },
    ]);
    expect(await listOpenGrants(t.db, orgId, { kind: 'seat' })).toHaveLength(2);
    expect(await listOpenGrants(t.db, orgId, {})).toHaveLength(3);
  });
});

describe('append-only guards', () => {
  it('rejects deleting a grant, lengthening it, or changing anything but valid_until', async () => {
    const { orgId } = await newOrg();
    const id = await credits(orgId, 3, { validUntil: fromNow(DAY) });

    expect(
      await errorText(
        t.db.execute(sql`
          update app.entitlement_grants set valid_until = valid_until + interval '1 day'
          where id = ${id}
        `),
      ),
    ).toMatch(/entitlement_grants/);
    expect(
      await errorText(
        t.db.execute(sql`update app.entitlement_grants set valid_until = null where id = ${id}`),
      ),
    ).toMatch(/entitlement_grants/);
    expect(
      await errorText(
        t.db.execute(sql`update app.entitlement_grants set quantity = 30 where id = ${id}`),
      ),
    ).toMatch(/entitlement_grants/);
    expect(
      await errorText(t.db.execute(sql`delete from app.entitlement_grants where id = ${id}`)),
    ).toMatch(/entitlement_grants/);

    // Shortening is allowed.
    await t.db.execute(sql`
      update app.entitlement_grants set valid_until = valid_until - interval '1 hour'
      where id = ${id}
    `);
  });

  it('allows a consumption to be reversed once and nothing else', async () => {
    const { orgId } = await newOrg();
    await credits(orgId, 3);
    const r = await take(orgId, 'invite:guard');
    if (!r.ok) throw new Error('expected ok');
    const id = r.consumptionId;

    expect(
      await errorText(
        t.db.execute(sql`update app.entitlement_consumptions set quantity = 2 where id = ${id}`),
      ),
    ).toMatch(/entitlement_consumptions/);
    expect(
      await errorText(t.db.execute(sql`delete from app.entitlement_consumptions where id = ${id}`)),
    ).toMatch(/entitlement_consumptions/);

    await t.db.execute(sql`
      update app.entitlement_consumptions set reversed_at = now(), reversal_reason = 'x'
      where id = ${id}
    `);
    expect(
      await errorText(
        t.db.execute(sql`
          update app.entitlement_consumptions set reversed_at = null, reversal_reason = null
          where id = ${id}
        `),
      ),
    ).toMatch(/entitlement_consumptions/);
    expect(
      await errorText(
        t.db.execute(sql`
          update app.entitlement_consumptions set reversal_reason = 'y' where id = ${id}
        `),
      ),
    ).toMatch(/entitlement_consumptions/);
  });
});

describe('audit', () => {
  it('records granted, consumed, reversed and grant_ended', async () => {
    const { orgId, ownerId } = await newOrg();
    const actor: Actor = { type: 'user', id: ownerId };
    const grantId = await credits(orgId, 10, { actor });
    const r = await take(orgId, 'invite:audit', 2, actor);
    if (!r.ok) throw new Error('expected ok');
    await reverse(t.db, r.consumptionId, 'withdrawn', actor);
    await endGrant(t.db, grantId, new Date(), actor);

    const expected: [string, string, string][] = [
      ['entitlements.granted', 'entitlement_grant', grantId],
      ['entitlements.consumed', 'entitlement_consumption', r.consumptionId],
      ['entitlements.reversed', 'entitlement_consumption', r.consumptionId],
      ['entitlements.grant_ended', 'entitlement_grant', grantId],
    ];
    for (const [action, subjectType, subjectId] of expected) {
      const { items } = await searchAudit(t.db, { action, orgId });
      expect(items, action).toHaveLength(1);
      expect(items[0]).toMatchObject({
        actorType: 'user',
        actorId: ownerId,
        orgId,
        subjectType,
        subjectId,
      });
    }
    const { items: consumed } = await searchAudit(t.db, {
      action: 'entitlements.consumed',
      orgId,
    });
    expect(consumed[0]?.data).toMatchObject({ kind: 'invite_credit', quantity: 2 });
  });

  it('records nothing for an idempotent replay', async () => {
    const { orgId } = await newOrg();
    const key = `replay:${newId()}`;
    await credits(orgId, 5, { key });
    await credits(orgId, 5, { key });
    await take(orgId, 'invite:replay');
    await take(orgId, 'invite:replay');
    expect((await searchAudit(t.db, { action: 'entitlements.granted', orgId })).items).toHaveLength(
      1,
    );
    expect(
      (await searchAudit(t.db, { action: 'entitlements.consumed', orgId })).items,
    ).toHaveLength(1);
  });
});

describe('privacyHandlers', () => {
  it('erase clears created_by on grants and consumptions; export lists what the user created', async () => {
    const { orgId, ownerId } = await newOrg();
    const actor: Actor = { type: 'user', id: ownerId };
    const grantId = await credits(orgId, 5, { actor });
    const r = await take(orgId, 'invite:privacy', 1, actor);
    if (!r.ok) throw new Error('expected ok');

    const exported = await privacyHandlers.export(t.db, ownerId);
    expect(exported).toMatchObject({
      entitlementGrantsCreated: [expect.objectContaining({ id: grantId })],
      entitlementConsumptionsCreated: [expect.objectContaining({ id: r.consumptionId })],
    });

    await privacyHandlers.erase(t.db, ownerId);
    const rows = await queryRows<{ n: number }>(
      t.db,
      sql`
        select (select count(*) from app.entitlement_grants where created_by = ${ownerId})
          + (select count(*) from app.entitlement_consumptions where created_by = ${ownerId})
          as n
      `,
    );
    expect(Number(rows[0]?.n)).toBe(0);
    expect(await balance(orgId)).toBe(4);
  });
});
