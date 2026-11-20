import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows, type Db, type DbOrTx, type Tx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { memoryStorage, type MemoryStorage } from '@/modules/media';
import { setSetting } from '@/modules/settings';
import { buildPrivacyRegistry } from '@/server/privacy-registry';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedMedia, seedOperator, seedSeeker } from '@tests/helpers/sp8';
import {
  finalizeExport,
  getExportDownload,
  requestExport,
  runExportStep,
  type ExportDeps,
} from './export';
import './notification-types';
import type { ExportPart, PrivacyHandler } from './types';
import { readZip } from './zip';

const NOW = new Date('2026-11-18T12:00:00Z');
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

let t: TestDb;
let storage: MemoryStorage;
let exported: Record<string, ExportPart>;
let calls: Record<string, number>;
/** Runs inside a module's exporter, with the database handle the step gave it. */
let onExport: ((db: DbOrTx, module: string) => Promise<void>) | undefined;
/** The transaction the code under test has open, if any (PGlite has one connection). */
let activeTx: Tx | null = null;

function handler(module: string): PrivacyHandler {
  return {
    module,
    tables: [],
    async exportData(db) {
      calls[module] = (calls[module] ?? 0) + 1;
      await onExport?.(db, module);
      return exported[module] ?? { records: {}, files: [] };
    },
    async erase() {
      return { erased: 0, retained: [] };
    },
  };
}

const registry = buildPrivacyRegistry([
  { handler: handler('a'), rules: [] },
  { handler: handler('b'), rules: [] },
]);
const deps = (): ExportDeps => ({ storage, registry, now: NOW });

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  storage = memoryStorage();
  exported = {};
  calls = {};
  onExport = undefined;
  activeTx = null;
});

/** `t.db`, remembering the open transaction so a storage hook can read through it. */
function tracedDb(): Db {
  return new Proxy(t.db, {
    get(target, prop) {
      if (prop === 'transaction') {
        return (fn: (tx: Tx) => Promise<unknown>) =>
          target.transaction(async (tx) => {
            activeTx = tx;
            try {
              return await fn(tx);
            } finally {
              activeTx = null;
            }
          });
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

/** True when the transaction behind `db` holds the row lock on the request. */
async function holdsRowLock(db: DbOrTx, requestId: string): Promise<boolean> {
  const [row] = await queryRows<{ locked: boolean }>(
    db,
    sql`select xmax::text = (txid_current() % 4294967296)::text as locked
        from app.privacy_requests where id = ${requestId}`,
  );
  return row?.locked === true;
}

/** `storage`, with `before` run ahead of every write. */
function hookedStorage(before: (path: string) => Promise<void>): MemoryStorage {
  return {
    ...storage,
    async write(bucket, path, bytes, contentType) {
      await before(path);
      await storage.write(bucket, path, bytes, contentType);
    },
  };
}

/** A host whose module `a` exports one record and one uploaded logo. */
async function seedExporter(o: { withObject?: boolean } = {}) {
  const org = await seedHostOrg(t.db);
  const mediaId = await seedMedia(t.db, org.orgId, 'logo');
  if (o.withObject !== false) {
    await storage.write('media-public', `${mediaId}/1280.webp`, new Uint8Array([7, 7]), 'image/webp');
  }
  const name = `logo-${mediaId}.webp`;
  exported.a = { records: { things: [{ note: 'mine' }], empty: [] }, files: [{ mediaId, name }] };
  exported.b = { records: { nothing: [] }, files: [] };
  return { userId: org.owner.userId, name };
}

async function stepIds(requestId: string): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(
    t.db,
    sql`select id::text from app.privacy_request_steps
        where request_id = ${requestId} and phase = 'export' order by module`,
  );
  return rows.map((row) => row.id);
}

async function runAll(requestId: string): Promise<void> {
  for (const id of await stepIds(requestId)) await runExportStep(t.db, id, deps());
  await finalizeExport(t.db, requestId, deps());
}

async function requestRow(requestId: string) {
  const [row] = await queryRows<{
    status: string;
    export_path: string | null;
    export_size_bytes: string | number | null;
    export_expires_at: Date | string | null;
  }>(
    t.db,
    sql`select status, export_path, export_size_bytes, export_expires_at
        from app.privacy_requests where id = ${requestId}`,
  );
  if (!row) throw new Error('request not found');
  return row;
}

const notified = (userId: string) =>
  queryRows<{ body: string; data: Record<string, unknown> }>(
    t.db,
    sql`select body, data from app.notifications
        where user_id = ${userId} and type = 'privacy.export_ready'`,
  );

describe('requestExport', () => {
  it('creates one step per module plus finalize, queues the steps and audits', async () => {
    const { userId } = await seedExporter();
    const { requestId } = await requestExport(t.db, userId, deps());

    const steps = await queryRows<{ module: string; phase: string; status: string }>(
      t.db,
      sql`select module, phase, status from app.privacy_request_steps
          where request_id = ${requestId} order by phase, module`,
    );
    expect(steps).toEqual([
      { module: 'a', phase: 'export', status: 'pending' },
      { module: 'b', phase: 'export', status: 'pending' },
      { module: 'privacy', phase: 'finalize', status: 'pending' },
    ]);
    const queued = await queryRows<{ dedupe_key: string }>(
      t.db,
      sql`select dedupe_key from app.outbox where topic = 'privacy.export_step'
          and payload->>'stepId' in (select id::text from app.privacy_request_steps
            where request_id = ${requestId})`,
    );
    expect(queued.map((row) => row.dedupe_key).sort()).toEqual(
      (await stepIds(requestId)).map((id) => `privacy_step:${id}`).sort(),
    );
    const audit = await queryRows(
      t.db,
      sql`select 1 from app.audit_events
          where action = 'privacy.export_requested' and subject_id = ${requestId}`,
    );
    expect(audit).toHaveLength(1);
    expect((await requestRow(requestId)).status).toBe('running');
  });

  it('refuses a second export while one is open, and a fourth in 30 days', async () => {
    const { userId } = await seedExporter();
    const first = await requestExport(t.db, userId, deps());
    await expect(requestExport(t.db, userId, deps())).rejects.toMatchObject({
      code: 'conflict',
      message: 'Your data download is already being prepared.',
      details: { reason: 'export_open' },
    });
    await runAll(first.requestId);
    for (let i = 0; i < 2; i++) {
      const next = await requestExport(t.db, userId, deps());
      await runAll(next.requestId);
    }
    await expect(requestExport(t.db, userId, deps())).rejects.toMatchObject({
      code: 'rate_limited',
      message: 'You can request your data 3 times in 30 days.',
    });
  });

  it('refuses an operator account', async () => {
    const operator = await seedOperator(t.db);
    await expect(requestExport(t.db, operator.userId, deps())).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Operator accounts are removed by the Owner.',
      details: { reason: 'operator_account' },
    });
  });
});

describe('the export archive', () => {
  it('holds the README, the modules with data and their files, and notifies once', async () => {
    const operator = await seedOperator(t.db, { role: 'owner' });
    await setSetting(t.db, 'privacy.export_ttl_days', 5, { operatorId: operator.userId });
    const { userId, name } = await seedExporter();
    const { requestId } = await requestExport(t.db, userId, deps());
    await runAll(requestId);

    const row = await requestRow(requestId);
    expect(row.status).toBe('completed');
    expect(row.export_path).toBe(`${requestId}.zip`);
    expect(new Date(row.export_expires_at ?? 0).toISOString()).toBe('2026-11-23T12:00:00.000Z');
    // The parts are gone; only the archive is left.
    expect(storage.list('privacy-exports')).toEqual([`${requestId}.zip`]);

    const zip = readZip(await storage.read('privacy-exports', `${requestId}.zip`));
    expect(Number(row.export_size_bytes)).toBeGreaterThan(0);
    expect([...zip.keys()].sort()).toEqual(['README.txt', 'a.json', `files/a/${name}`]);
    expect(JSON.parse(text(zip.get('a.json')))).toEqual({ things: [{ note: 'mine' }], empty: [] });
    expect(zip.get(`files/a/${name}`)).toEqual(new Uint8Array([7, 7]));
    expect(text(zip.get('README.txt'))).toBe(
      [
        'Your Explore&Earn data',
        `Created 2026-11-18T12:00:00.000Z for account ${userId}.`,
        '',
        'Each <module>.json file holds what one part of Explore&Earn stores about you.',
        'The files folder holds the files you uploaded.',
        'Files we could not copy: none.',
        '',
        `This download expires on 2026-11-23. Questions? Visit ${process.env.APP_URL}/help/contact.`,
        '',
      ].join('\n'),
    );

    const sent = await notified(userId);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toBe('Download it within 5 days from your privacy settings.');
    expect(sent[0]?.data).toMatchObject({ ttlDays: 5, url: '/host/settings/privacy' });
    const audit = await queryRows<{ data: Record<string, unknown> }>(
      t.db,
      sql`select data from app.audit_events
          where action = 'privacy.export_completed' and subject_id = ${requestId}`,
    );
    expect(audit).toEqual([{ data: { bytes: Number(row.export_size_bytes), modules: 1 } }]);

    await setSetting(t.db, 'privacy.export_ttl_days', 7, { operatorId: operator.userId });
  });

  it('still completes when a file is missing, and names it in the README', async () => {
    const { userId, name } = await seedExporter({ withObject: false });
    const { requestId } = await requestExport(t.db, userId, deps());
    await runAll(requestId);

    expect((await requestRow(requestId)).status).toBe('completed');
    const zip = readZip(await storage.read('privacy-exports', `${requestId}.zip`));
    expect([...zip.keys()].sort()).toEqual(['README.txt', 'a.json']);
    expect(text(zip.get('README.txt'))).toContain(`Files we could not copy: files/a/${name}.`);
  });

  it('runs a retried step and a retried finalize once', async () => {
    const { userId } = await seedExporter();
    const { requestId } = await requestExport(t.db, userId, deps());
    const [a, b] = await stepIds(requestId);
    if (!a || !b) throw new Error('steps missing');

    await runExportStep(t.db, a, deps());
    await runExportStep(t.db, a, deps());
    expect(calls.a).toBe(1);
    // Finalize before the last step is done must not complete the request.
    await expect(finalizeExport(t.db, requestId, deps())).rejects.toThrow(/not finished/);
    await runExportStep(t.db, b, deps());

    const finalize = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox
          where dedupe_key = ${`privacy_export_finalize:${requestId}`}`,
    );
    expect(finalize[0]?.n).toBe(1);

    await finalizeExport(t.db, requestId, deps());
    await finalizeExport(t.db, requestId, deps());
    expect(await notified(userId)).toHaveLength(1);
    const done = await queryRows<{ status: string }>(
      t.db,
      sql`select status from app.privacy_request_steps where request_id = ${requestId}`,
    );
    expect(done.every((step) => step.status === 'done')).toBe(true);
  });

  it('stores a failing step message without the failure reaching the request', async () => {
    const { userId } = await seedExporter();
    const { requestId } = await requestExport(t.db, userId, deps());
    const [a] = await stepIds(requestId);
    if (!a) throw new Error('step missing');
    const broken = buildPrivacyRegistry([
      {
        handler: {
          ...handler('a'),
          exportData: async () => {
            throw new Error('exporter broke');
          },
        },
        rules: [],
      },
    ]);
    await expect(runExportStep(t.db, a, { ...deps(), registry: broken })).rejects.toThrow(
      'exporter broke',
    );
    const [step] = await queryRows<{ status: string; last_error: string }>(
      t.db,
      sql`select status, last_error from app.privacy_request_steps where id = ${a}`,
    );
    expect(step).toEqual({ status: 'pending', last_error: 'exporter broke' });
    expect((await requestRow(requestId)).status).toBe('running');
  });
});

describe('getExportDownload', () => {
  it('serves only the owner, only when ready, and only until it expires', async () => {
    const { userId } = await seedExporter();
    const stranger = (await seedSeeker(t.db)).userId;
    const { requestId } = await requestExport(t.db, userId, deps());

    await expect(
      getExportDownload(t.db, { userId: stranger, requestId }, deps()),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      getExportDownload(t.db, { userId, requestId: newId() }, deps()),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      getExportDownload(t.db, { userId, requestId: 'nope' }, deps()),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(getExportDownload(t.db, { userId, requestId }, deps())).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'not_ready' },
    });

    await runAll(requestId);
    await expect(
      getExportDownload(t.db, { userId: stranger, requestId }, deps()),
    ).rejects.toMatchObject({ code: 'not_found' });
    const { url } = await getExportDownload(t.db, { userId, requestId }, deps());
    expect(url).toBe(`memory://privacy-exports/${requestId}.zip?expiresIn=300`);
    const downloads = await queryRows<{ actor_id: string }>(
      t.db,
      sql`select actor_id::text from app.audit_events
          where action = 'privacy.export_downloaded' and subject_id = ${requestId}`,
    );
    expect(downloads).toEqual([{ actor_id: userId }]);

    const later = new Date('2026-11-25T12:00:00Z');
    await expect(
      getExportDownload(t.db, { userId, requestId }, { ...deps(), now: later }),
    ).rejects.toMatchObject({
      code: 'gone',
      status: 410,
      message: 'This download has expired. Request a new one from your privacy settings.',
    });
  });
});

describe('an export while the account is being deleted (issue 232)', () => {
  it('holds the request row lock while a step exports and writes its part', async () => {
    const { userId } = await seedExporter();
    const { requestId } = await requestExport(t.db, userId, deps());
    const [a] = await stepIds(requestId);
    if (!a) throw new Error('step missing');

    const seen: { at: string; locked: boolean }[] = [];
    onExport = async (db) => {
      seen.push({ at: 'export', locked: await holdsRowLock(db, requestId) });
    };
    const hooked = hookedStorage(async (path) => {
      seen.push({ at: path, locked: await holdsRowLock(activeTx ?? t.db, requestId) });
    });
    await runExportStep(tracedDb(), a, { ...deps(), storage: hooked });

    expect(seen.map((s) => s.at)).toEqual([
      'export',
      expect.stringContaining(`${requestId}/parts/files/a/`),
      `${requestId}/parts/a.json`,
    ]);
    expect(seen.every((s) => s.locked)).toBe(true);
  });

  it('writes nothing for a request the eraser already stopped', async () => {
    const { userId } = await seedExporter();
    const { requestId } = await requestExport(t.db, userId, deps());
    const [a, b] = await stepIds(requestId);
    if (!a || !b) throw new Error('steps missing');
    await runExportStep(t.db, b, deps());
    await t.db.execute(
      sql`update app.privacy_requests set status = 'failed' where id = ${requestId}`,
    );

    await runExportStep(t.db, a, deps());

    expect(calls.a).toBeUndefined();
    expect(storage.list('privacy-exports')).toEqual([`${requestId}/parts/b.json`]);
    const finalize = await queryRows(
      t.db,
      sql`select 1 from app.outbox where dedupe_key = ${`privacy_export_finalize:${requestId}`}`,
    );
    expect(finalize).toEqual([]);
  });

  it('holds the request row lock while finalize writes the archive', async () => {
    const { userId } = await seedExporter();
    const { requestId } = await requestExport(t.db, userId, deps());
    for (const id of await stepIds(requestId)) await runExportStep(t.db, id, deps());

    const seen: boolean[] = [];
    const hooked = hookedStorage(async (path) => {
      if (path === `${requestId}.zip`) {
        seen.push(await holdsRowLock(activeTx ?? t.db, requestId));
      }
    });
    await finalizeExport(tracedDb(), requestId, { ...deps(), storage: hooked });

    expect(seen).toEqual([true]);
    expect((await requestRow(requestId)).status).toBe('completed');
  });

  it('deletes the archive it just wrote when the request stopped being open', async () => {
    const { userId } = await seedExporter();
    const { requestId } = await requestExport(t.db, userId, deps());
    for (const id of await stepIds(requestId)) await runExportStep(t.db, id, deps());

    // The eraser stops the request between finalize's check and its update.
    const hooked = hookedStorage(async (path) => {
      if (path !== `${requestId}.zip`) return;
      await (activeTx ?? t.db).execute(
        sql`update app.privacy_requests set status = 'failed' where id = ${requestId}`,
      );
    });
    await finalizeExport(tracedDb(), requestId, { ...deps(), storage: hooked });

    expect(storage.list('privacy-exports')).toEqual([]);
    const row = await requestRow(requestId);
    expect(row.status).toBe('failed');
    expect(row.export_path).toBeNull();
    expect(await notified(userId)).toEqual([]);
  });

  it('clears everything a stopped request left, found by its id and not by a part', async () => {
    const { userId } = await seedExporter();
    const { requestId } = await requestExport(t.db, userId, deps());
    for (const id of await stepIds(requestId)) await runExportStep(t.db, id, deps());
    // A file a step copied before it wrote its part, and an archive nothing points at.
    const bytes = new Uint8Array([9]);
    await storage.write(
      'privacy-exports',
      `${requestId}/parts/files/c/late.webp`,
      bytes,
      'image/webp',
    );
    await storage.write('privacy-exports', `${requestId}.zip`, bytes, 'application/zip');
    await t.db.execute(
      sql`update app.privacy_requests set status = 'failed' where id = ${requestId}`,
    );

    await finalizeExport(t.db, requestId, deps());

    expect(storage.list('privacy-exports')).toEqual([]);
  });
});
