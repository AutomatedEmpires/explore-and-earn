// Founding codes, retired by FD-7 (./founding-codes.ts): what is left is code generation,
// normalization, hashed storage and the legacy count, which code outside billing still imports.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import {
  createFoundingCodes,
  generateFoundingCode,
  getFoundingCount,
  normalizeFoundingCode,
} from './founding-codes';

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

describe('getFoundingCount', () => {
  it('counts no holds or redemptions, since nothing holds or redeems a code any more', async () => {
    await createFoundingCodes(t.db, { count: 2, note: 'x', operatorId: null });
    expect(await getFoundingCount(t.db)).toEqual({ redeemed: 0, held: 0, max: 100 });
  });
});
