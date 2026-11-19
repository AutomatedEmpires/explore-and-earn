// The content module's privacy handler (SP8 plan Task 24): a person's legal acceptances are
// exported, and kept for 7 years when the account is deleted, as proof of what they agreed to.
// Legal documents themselves hold no one's personal data. On PGlite.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedSeeker } from '@tests/helpers/sp8';
import { privacyHandler } from './privacy';

const NOW = new Date('2026-12-01T12:00:00Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function accept(userId: string, slug: string, version: number): Promise<void> {
  await t.db.execute(sql`
    insert into app.legal_acceptances (id, user_id, slug, version, accepted_at)
    values (${newId()}, ${userId}, ${slug}, ${version}, ${NOW.toISOString()}::timestamptz)
  `);
}

function erase(
  subject: Parameters<typeof privacyHandler.erase>[1],
  holds: ('all' | 'billing')[] = [],
) {
  return withTx(t.db, (tx) =>
    privacyHandler.erase(tx, subject, { requestId: newId(), now: NOW, holds }),
  );
}

describe('content privacyHandler', () => {
  it('claims the legal tables', () => {
    expect(privacyHandler.module).toBe('content');
    expect(privacyHandler.tables).toEqual(
      expect.arrayContaining(['legal_documents', 'legal_acceptances']),
    );
  });

  it("exports a person's acceptances: document, version and date", async () => {
    const { userId } = await seedSeeker(t.db);
    const { userId: other } = await seedSeeker(t.db);
    await accept(userId, 'terms', 1);
    await accept(userId, 'privacy', 2);
    await accept(other, 'terms', 1);

    const part = await privacyHandler.exportData(t.db, { kind: 'user', userId });
    expect(part).toEqual({
      records: {
        acceptances: [
          { slug: 'privacy', version: 2, acceptedAt: NOW },
          { slug: 'terms', version: 1, acceptedAt: NOW },
        ],
      },
      files: [],
    });
  });

  it('keeps acceptances for 7 years as a legal obligation, and erases nothing', async () => {
    const { userId } = await seedSeeker(t.db);
    await accept(userId, 'terms', 1);

    const first = await erase({ kind: 'user', userId });
    expect(first).toEqual({
      erased: 0,
      retained: [{ table: 'legal_acceptances', reason: 'legal_obligation', until: '2033-12-01' }],
    });
    expect(await erase({ kind: 'user', userId })).toEqual(first);
    expect(await erase({ kind: 'user', userId }, ['all'])).toEqual(first);
    const rows = await queryRows(
      t.db,
      sql`select id from app.legal_acceptances where user_id = ${userId}`,
    );
    expect(rows).toHaveLength(1);
  });

  it('reports nothing for a person with no acceptances, or an organization', async () => {
    const { userId } = await seedSeeker(t.db);
    expect(await erase({ kind: 'user', userId })).toEqual({ erased: 0, retained: [] });

    const { orgId } = await seedHostOrg(t.db);
    expect(await erase({ kind: 'org', orgId })).toEqual({ erased: 0, retained: [] });
    expect(await privacyHandler.exportData(t.db, { kind: 'org', orgId })).toEqual({
      records: {},
      files: [],
    });
  });
});
