// Founding codes (Task 12): hashed storage, normalization, capped holds and redemption.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { setSetting } from '@/modules/settings';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg } from '../../../tests/helpers/sp2';
import {
  createFoundingCodes,
  generateFoundingCode,
  getFoundingCount,
  holdFoundingCode,
  normalizeFoundingCode,
  redeemFoundingCode,
  releaseHold,
} from './founding';

let t: TestDb;
const operatorId = newId();

beforeAll(async () => {
  t = await createTestDb();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${operatorId}, ${`user_${operatorId}`}, 'ops@example.test', 'Ops', 'operator')
  `);
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.founding_codes`);
  await t.db.execute(sql`delete from app.settings`);
});

const CODE = /^EE-(?:[0-9A-HJKMNP-TV-Z]{4})-(?:[0-9A-HJKMNP-TV-Z]{4})$/;

const hold = (orgId: string, code: string, until = new Date(Date.now() + 31 * 60_000)) =>
  withTx(t.db, (tx) => holdFoundingCode(tx, { orgId, code, until }));

async function expectReason(p: Promise<unknown>, code: string, reason: string) {
  await expect(p).rejects.toMatchObject({ code, details: { reason } });
}

describe('codes', () => {
  it('are EE-XXXX-XXXX in Crockford base32', () => {
    for (let i = 0; i < 200; i++) expect(generateFoundingCode()).toMatch(CODE);
    // Every byte maps onto the 32-letter alphabet.
    expect(generateFoundingCode(() => new Uint8Array(8).fill(31))).toBe('EE-ZZZZ-ZZZZ');
    expect(generateFoundingCode(() => new Uint8Array(8))).toBe('EE-0000-0000');
  });

  it('normalize case, hyphens, spaces and look-alike letters', () => {
    expect(normalizeFoundingCode('ee-ab12-cd34 ')).toBe(normalizeFoundingCode('EEAB12CD34'));
    expect(normalizeFoundingCode('EEAB12CD34')).toBe('EEAB12CD34');
    expect(normalizeFoundingCode('EE-AB12-CD3O')).toBe(normalizeFoundingCode('EE-AB12-CD30'));
    expect(normalizeFoundingCode('EE-AB1I-CDL4')).toBe('EEAB11CD14');
    expect(normalizeFoundingCode('EE-AB12-CD3U')).toBeNull();
    expect(normalizeFoundingCode('EE-AB12-CD3')).toBeNull();
    expect(normalizeFoundingCode('XX-AB12-CD34')).toBeNull();
    expect(normalizeFoundingCode('')).toBeNull();
  });
});

describe('createFoundingCodes', () => {
  it('returns plaintext codes but stores only hashes and the last 4', async () => {
    const codes = await createFoundingCodes(t.db, { count: 3, note: 'batch 1', operatorId });
    expect(codes).toHaveLength(3);
    for (const c of codes) expect(c).toMatch(CODE);

    const rows = await queryRows<{ row: string; last4: string }>(
      t.db,
      sql`select f::text as row, last4 from app.founding_codes f`,
    );
    expect(rows).toHaveLength(3);
    for (const c of codes) {
      const normalized = normalizeFoundingCode(c) ?? '';
      for (const r of rows) {
        expect(r.row).not.toContain(c);
        expect(r.row).not.toContain(normalized);
        expect(r.row).not.toContain(normalized.slice(2));
      }
    }
    expect(rows.map((r) => r.last4).sort()).toEqual(codes.map((c) => c.slice(-4)).sort());
  });

  it('records the count and the last 4 of each code, never the codes', async () => {
    const codes = await createFoundingCodes(t.db, { count: 2, note: 'audit', operatorId });
    const [event] = await queryRows<{ data: string; actor_id: string }>(
      t.db,
      sql`select data::text as data, actor_id from app.audit_events
          where action = 'billing.founding_codes_created' order by created_at desc limit 1`,
    );
    expect(event?.actor_id).toBe(operatorId);
    const data = JSON.parse(event?.data ?? '{}') as { count: number; last4: string[] };
    expect(data.count).toBe(2);
    expect(data.last4.sort()).toEqual(codes.map((c) => c.slice(-4)).sort());
    for (const c of codes) expect(event?.data).not.toContain(c);
  });

  it('accepts 1 to 100 codes', async () => {
    await expectReason(
      createFoundingCodes(t.db, { count: 0, note: 'x', operatorId: null }),
      'bad_request',
      'invalid_count',
    );
    await expectReason(
      createFoundingCodes(t.db, { count: 101, note: 'x', operatorId: null }),
      'bad_request',
      'invalid_count',
    );
    expect(await createFoundingCodes(t.db, { count: 1, note: 'x', operatorId: null })).toHaveLength(
      1,
    );
  });
});

describe('holds', () => {
  it('a code held by one org is invalid for another until the hold passes', async () => {
    const a = await seedHostOrg(t.db, { name: 'Org A' });
    const b = await seedHostOrg(t.db, { name: 'Org B' });
    const [code] = await createFoundingCodes(t.db, { count: 1, note: 'x', operatorId: null });

    const held = await hold(a.orgId, code ?? '');
    await expectReason(hold(b.orgId, code ?? ''), 'bad_request', 'code_invalid');
    expect(await getFoundingCount(t.db)).toEqual({ redeemed: 0, held: 1, max: 100 });

    // The same org holding it again extends its hold.
    const later = new Date(Date.now() + 60 * 60_000);
    expect(await hold(a.orgId, (code ?? '').toLowerCase(), later)).toEqual(held);
    const [row] = await queryRows<{ held_until: string }>(
      t.db,
      sql`select held_until::text from app.founding_codes`,
    );
    expect(new Date(row?.held_until ?? 0).getTime()).toBe(later.getTime());

    await t.db.execute(
      sql`update app.founding_codes set held_until = now() - interval '1 second'`,
    );
    expect(await getFoundingCount(t.db)).toEqual({ redeemed: 0, held: 0, max: 100 });
    expect(await hold(b.orgId, code ?? '')).toEqual(held);
  });

  it('rejects unknown, malformed and revoked codes', async () => {
    const a = await seedHostOrg(t.db);
    await expectReason(hold(a.orgId, 'EE-0000-0000'), 'bad_request', 'code_invalid');
    await expectReason(hold(a.orgId, 'not a code'), 'bad_request', 'code_invalid');
    const [code] = await createFoundingCodes(t.db, { count: 1, note: 'x', operatorId: null });
    await t.db.execute(sql`update app.founding_codes set status = 'revoked'`);
    await expectReason(hold(a.orgId, code ?? ''), 'bad_request', 'code_invalid');
  });

  it('never makes a redeemed code available again, and still counts it', async () => {
    const a = await seedHostOrg(t.db);
    const b = await seedHostOrg(t.db);
    const [code] = await createFoundingCodes(t.db, { count: 1, note: 'x', operatorId: null });
    const { codeId } = await hold(a.orgId, code ?? '');
    await withTx(t.db, (tx) => redeemFoundingCode(tx, { codeId, orgId: a.orgId }));

    expect(await getFoundingCount(t.db)).toEqual({ redeemed: 1, held: 0, max: 100 });
    await expectReason(hold(b.orgId, code ?? ''), 'bad_request', 'code_invalid');
    await expectReason(hold(a.orgId, code ?? ''), 'bad_request', 'code_invalid');
    // Redeeming again is a no-op.
    await withTx(t.db, (tx) => redeemFoundingCode(tx, { codeId, orgId: a.orgId }));
    expect(await getFoundingCount(t.db)).toEqual({ redeemed: 1, held: 0, max: 100 });
  });

  it('refuses a hold once redeemed plus held reaches founding.max_hosts', async () => {
    await setSetting(t.db, 'founding.max_hosts', 2, { operatorId });
    const codes = await createFoundingCodes(t.db, { count: 3, note: 'x', operatorId: null });
    for (const code of codes.slice(0, 2)) {
      const org = await seedHostOrg(t.db);
      const { codeId } = await hold(org.orgId, code);
      await withTx(t.db, (tx) => redeemFoundingCode(tx, { codeId, orgId: org.orgId }));
    }
    const late = await seedHostOrg(t.db);
    await expectReason(hold(late.orgId, codes[2] ?? ''), 'conflict', 'founding_unavailable');
    expect(await getFoundingCount(t.db)).toEqual({ redeemed: 2, held: 0, max: 2 });
  });

  it('releases an org hold, and an org holds one code at a time', async () => {
    const a = await seedHostOrg(t.db);
    const [first, second] = await createFoundingCodes(t.db, {
      count: 2,
      note: 'x',
      operatorId: null,
    });
    await hold(a.orgId, first ?? '');
    await hold(a.orgId, second ?? '');
    expect((await getFoundingCount(t.db)).held).toBe(1);

    await withTx(t.db, (tx) => releaseHold(tx, a.orgId));
    expect((await getFoundingCount(t.db)).held).toBe(0);
    const b = await seedHostOrg(t.db);
    await hold(b.orgId, second ?? '');
  });
});
