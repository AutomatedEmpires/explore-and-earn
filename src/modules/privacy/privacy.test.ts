import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, withTx, type Tx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { memoryStorage, type MemoryStorage } from '@/modules/media';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedOperator, seedSeeker } from '@tests/helpers/sp8';

const consent = vi.hoisted(() => ({
  eraseConsentLinks: vi.fn(async (): Promise<number> => 0),
  exportConsent: vi.fn(async (): Promise<unknown[]> => []),
}));
vi.mock('./consent', () => ({ CONSENT_TABLES: [], recordConsent: vi.fn(), ...consent }));

const storage = vi.hoisted(() => ({ current: undefined as MemoryStorage | undefined }));
vi.mock('@/modules/media', async (orig) => ({
  ...(await orig<typeof import('@/modules/media')>()),
  getStorage: () => storage.current,
}));

const { setLegalHold } = await import('./holds');
const { privacyHandler } = await import('./privacy');

const NOW = new Date('2026-11-18T12:00:00Z');
const ctx = (holds: ('all' | 'reports')[] = []) => ({ requestId: newId(), now: NOW, holds });

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  storage.current = memoryStorage();
  consent.eraseConsentLinks.mockReset().mockResolvedValue(0);
  consent.exportConsent.mockReset().mockResolvedValue([]);
});

const KEPT = [
  { table: 'privacy_requests', reason: 'legal_obligation', until: null },
  { table: 'privacy_request_steps', reason: 'legal_obligation', until: null },
  { table: 'privacy_deletion_ledger', reason: 'legal_obligation', until: null },
];

async function seedExport(userId: string, status: 'completed' | 'running'): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.privacy_requests (id, user_id, kind, status, export_path, export_size_bytes)
    values (${id}, ${userId}, 'export', ${status},
      ${status === 'completed' ? `${id}.zip` : null}, ${status === 'completed' ? 3 : null})
  `);
  return id;
}

describe('the privacy module handler', () => {
  it('claims its five tables', () => {
    expect(privacyHandler.module).toBe('privacy');
    expect(privacyHandler.tables).toEqual([
      'privacy_requests',
      'privacy_request_steps',
      'privacy_deletion_ledger',
      'privacy_legal_holds',
      'retention_runs',
    ]);
  });

  it('exports the requests and consent, never a hold', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const operatorId = (await seedOperator(t.db, { role: 'owner' })).userId;
    await seedExport(userId, 'completed');
    await setLegalHold(
      t.db,
      { userId, scope: 'all', reason: 'A reason nobody may read', reviewAt: '2026-12-01', operatorId },
      NOW,
    );
    consent.exportConsent.mockResolvedValue([{ analytics: true }]);

    const part = await privacyHandler.exportData(t.db, { kind: 'user', userId });
    expect(Object.keys(part.records).sort()).toEqual(['consent', 'requests']);
    expect(part.records.requests).toEqual([
      expect.objectContaining({ kind: 'export', status: 'completed' }),
    ]);
    expect(part.records.consent).toEqual([{ analytics: true }]);
    expect(JSON.stringify(part)).not.toContain('nobody may read');
    expect(part.files).toEqual([]);
  });

  it('erases consent links once and reports the same records kept both times', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    consent.eraseConsentLinks.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const subject = { kind: 'user' as const, userId };

    const first = await withTx(t.db, (tx) => privacyHandler.erase(tx, subject, ctx()));
    const second = await withTx(t.db, (tx) => privacyHandler.erase(tx, subject, ctx()));
    expect(first).toEqual({ erased: 1, retained: KEPT });
    expect(second).toEqual({ erased: 0, retained: KEPT });
  });

  it('deletes the export archives and stops an export still being built', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const other = (await seedSeeker(t.db)).userId;
    const done = await seedExport(userId, 'completed');
    const building = await seedExport(userId, 'running');
    const theirs = await seedExport(other, 'completed');
    const store = storage.current as MemoryStorage;
    const bytes = new Uint8Array([1, 2, 3]);
    await store.write('privacy-exports', `${done}.zip`, bytes, 'application/zip');
    await store.write('privacy-exports', `${theirs}.zip`, bytes, 'application/zip');
    await t.db.execute(sql`
      insert into app.privacy_request_steps
        (id, request_id, subject_kind, subject_id, module, phase, status)
      values (${newId()}, ${building}, 'user', ${userId}, 'identity', 'export', 'done')
    `);
    await store.write(
      'privacy-exports',
      `${building}/parts/identity.json`,
      new TextEncoder().encode(JSON.stringify({ records: {}, missingFiles: [], files: ['a.webp'] })),
      'application/json',
    );
    await store.write(
      'privacy-exports',
      `${building}/parts/files/identity/a.webp`,
      bytes,
      'image/webp',
    );

    const subject = { kind: 'user' as const, userId };
    const first = await withTx(t.db, (tx) => privacyHandler.erase(tx, subject, ctx()));
    expect(first.erased).toBe(2);
    expect(store.list('privacy-exports')).toEqual([`${theirs}.zip`]);
    const rows = await queryRows<{ id: string; status: string; export_path: string | null }>(
      t.db,
      sql`select id::text, status, export_path from app.privacy_requests
          where user_id = ${userId} order by id`,
    );
    expect(rows).toEqual([
      { id: done, status: 'completed', export_path: null },
      { id: building, status: 'failed', export_path: null },
    ]);

    const second = await withTx(t.db, (tx) => privacyHandler.erase(tx, subject, ctx()));
    expect(second).toEqual({ erased: 0, retained: first.retained });
  });

  it('removes what an export left by the request id, not by its parts (issue 232)', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const other = (await seedSeeker(t.db)).userId;
    // One open export per person: the earlier one failed before this one started.
    const stopped = await seedExport(userId, 'running');
    await t.db.execute(
      sql`update app.privacy_requests set status = 'failed' where id = ${stopped}`,
    );
    const building = await seedExport(userId, 'running');
    const theirs = await seedExport(other, 'running');
    const store = storage.current as MemoryStorage;
    const bytes = new Uint8Array([1, 2, 3]);
    const put = (path: string) => store.write('privacy-exports', path, bytes, 'text/plain');
    // A step copied a file and has not written its part yet: no JSON names the file.
    await put(`${building}/parts/files/media/a.webp`);
    // Finalize wrote the archive and has not stored its path yet.
    await put(`${building}.zip`);
    // An export that failed earlier left a part and an archive behind.
    await put(`${stopped}/parts/identity.json`);
    await put(`${stopped}.zip`);
    await put(`${theirs}/parts/identity.json`);

    await withTx(t.db, (tx) => privacyHandler.erase(tx, { kind: 'user', userId }, ctx()));

    expect(store.list('privacy-exports')).toEqual([`${theirs}/parts/identity.json`]);
    const rows = await queryRows<{ id: string; status: string }>(
      t.db,
      sql`select id::text, status from app.privacy_requests where user_id = ${userId} order by id`,
    );
    expect(rows).toEqual([
      { id: stopped, status: 'failed' },
      { id: building, status: 'failed' },
    ]);
  });

  it('locks and stops an export before it removes the files (issue 232)', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const building = await seedExport(userId, 'running');
    const base = storage.current as MemoryStorage;
    await base.write(
      'privacy-exports',
      `${building}/parts/identity.json`,
      new Uint8Array([1]),
      'application/json',
    );
    let current: Tx | undefined;
    const seen: { locked: boolean; status: string }[] = [];
    storage.current = {
      ...base,
      async remove(bucket, path) {
        if (!current) throw new Error('no transaction');
        const [row] = await queryRows<{ locked: boolean; status: string }>(
          current,
          sql`select xmax::text = (txid_current() % 4294967296)::text as locked, status
              from app.privacy_requests where id = ${building}`,
        );
        if (row) seen.push(row);
        await base.remove(bucket, path);
      },
    };

    await withTx(t.db, (tx) => {
      current = tx;
      return privacyHandler.erase(tx, { kind: 'user', userId }, ctx());
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.locked && s.status === 'failed')).toBe(true);
    expect(base.list('privacy-exports')).toEqual([]);
  });

  it('keeps everything under a hold on everything, and reports the hold', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const operatorId = (await seedOperator(t.db, { role: 'owner' })).userId;
    const done = await seedExport(userId, 'completed');
    const store = storage.current as MemoryStorage;
    await store.write('privacy-exports', `${done}.zip`, new Uint8Array([1]), 'application/zip');
    await setLegalHold(
      t.db,
      { userId, scope: 'all', reason: 'Litigation hold 77', reviewAt: '2026-12-01', operatorId },
      NOW,
    );

    const result = await withTx(t.db, (tx) =>
      privacyHandler.erase(tx, { kind: 'user', userId }, ctx(['all'])),
    );
    expect(result).toEqual({
      erased: 0,
      retained: [...KEPT, { table: 'privacy_legal_holds', reason: 'legal_hold', until: null }],
    });
    expect(consent.eraseConsentLinks).not.toHaveBeenCalled();
    expect(store.has('privacy-exports', `${done}.zip`)).toBe(true);
  });

  it('erases nothing for an organization and reports its hold', async () => {
    const org = await seedHostOrg(t.db);
    const operatorId = (await seedOperator(t.db, { role: 'owner' })).userId;
    const subject = { kind: 'org' as const, orgId: org.orgId };
    expect(await withTx(t.db, (tx) => privacyHandler.erase(tx, subject, ctx()))).toEqual({
      erased: 0,
      retained: [],
    });
    await setLegalHold(
      t.db,
      {
        orgId: org.orgId,
        scope: 'reports',
        reason: 'Fraud inquiry 12',
        reviewAt: '2026-12-01',
        operatorId,
      },
      NOW,
    );
    expect(
      await withTx(t.db, (tx) => privacyHandler.erase(tx, subject, ctx(['reports']))),
    ).toEqual({
      erased: 0,
      retained: [{ table: 'privacy_legal_holds', reason: 'legal_hold', until: null }],
    });
    expect(consent.eraseConsentLinks).not.toHaveBeenCalled();
  });
});
