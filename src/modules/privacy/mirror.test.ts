import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { makeFakeLedgerMirror } from '@tests/fakes/sp8/ledger-mirror';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedOperator, seedSeeker } from '@tests/helpers/sp8';
import { releaseLegalHold, setLegalHold } from './holds';
import { writeLedgerRow } from './ledger';
import {
  getLedgerMirror,
  localLedgerMirror,
  mirrorLedgerEntry,
  mirrorLegalHold,
  NOOP_LEDGER_MIRROR,
} from './mirror';

const ERASED_AT = new Date('2026-11-18T12:00:00Z');
const NOW = new Date('2026-11-18T12:05:00Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function seedLedger() {
  const userId = newId();
  const requestId = newId();
  const { ledgerId } = await writeLedgerRow(t.db, { userId, requestId, erasedAt: ERASED_AT });
  return { userId, requestId, ledgerId };
}

const mirroredAt = async (ledgerId: string) =>
  (
    await queryRows<{ mirrored_at: Date | string | null }>(
      t.db,
      sql`select mirrored_at from app.privacy_deletion_ledger where id = ${ledgerId}`,
    )
  )[0]?.mirrored_at ?? null;

describe('the ledger row', () => {
  it('is written once per person', async () => {
    const userId = newId();
    const first = await writeLedgerRow(t.db, { userId, requestId: newId(), erasedAt: ERASED_AT });
    const second = await writeLedgerRow(t.db, { userId, requestId: newId(), erasedAt: NOW });
    expect(first.created).toBe(true);
    expect(second).toEqual({ ledgerId: first.ledgerId, created: false });
  });
});

describe('privacy.ledger_mirror', () => {
  it('copies ids and the time to the mirror and stamps the row, once', async () => {
    const { userId, requestId, ledgerId } = await seedLedger();
    const mirror = makeFakeLedgerMirror();
    await mirrorLedgerEntry(t.db, ledgerId, { mirror, now: NOW });
    await mirrorLedgerEntry(t.db, ledgerId, { mirror, now: NOW });

    expect(mirror.entries).toEqual([
      { ledgerId, userId, requestId, erasedAt: '2026-11-18T12:00:00.000Z' },
    ]);
    expect(new Date((await mirroredAt(ledgerId)) ?? 0)).toEqual(NOW);
  });

  it('leaves the row unstamped when no mirror is configured', async () => {
    const { ledgerId } = await seedLedger();
    await mirrorLedgerEntry(t.db, ledgerId, { mirror: NOOP_LEDGER_MIRROR, now: NOW });
    expect(await mirroredAt(ledgerId)).toBeNull();
  });

  it('ignores an unknown ledger id', async () => {
    const mirror = makeFakeLedgerMirror();
    await mirrorLedgerEntry(t.db, newId(), { mirror, now: NOW });
    expect(mirror.entries).toEqual([]);
  });
});

describe('getLedgerMirror', () => {
  it('stores nothing outside dev when the backup project is not configured', async () => {
    expect(getLedgerMirror({ APP_ENV: 'preview' })).toBe(NOOP_LEDGER_MIRROR);
    expect(getLedgerMirror({ APP_ENV: 'prod', BACKUP_SUPABASE_URL: 'https://b.example.test' })).toBe(
      NOOP_LEDGER_MIRROR,
    );
    expect(getLedgerMirror({ APP_ENV: 'dev' })).not.toBe(NOOP_LEDGER_MIRROR);
    expect(
      getLedgerMirror({
        APP_ENV: 'prod',
        BACKUP_SUPABASE_URL: 'https://b.example.test',
        BACKUP_SUPABASE_SERVICE_ROLE_KEY: 'key',
      }),
    ).not.toBe(NOOP_LEDGER_MIRROR);
    expect(await NOOP_LEDGER_MIRROR.listSince(new Date(0))).toEqual([]);
  });

  it('writes one JSON file per entry under the day it was erased, in dev', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ledger-147-'));
    try {
      const mirror = localLedgerMirror(dir);
      const entry = {
        ledgerId: newId(),
        userId: newId(),
        requestId: newId(),
        erasedAt: new Date().toISOString(),
      };
      await mirror.put(entry);
      const file = path.join(dir, entry.erasedAt.slice(0, 10), `${entry.ledgerId}.json`);
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
        userId: entry.userId,
        requestId: entry.requestId,
        erasedAt: entry.erasedAt,
      });
      expect(await mirror.listSince(new Date(Date.now() - 60_000))).toEqual([entry]);
      expect(await mirror.listSince(new Date(Date.now() + 60_000))).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('privacy.hold_mirror (issue 232)', () => {
  const REASON = 'Subpoena 26-232, sealed by the court';

  it('copies a hold to the mirror without its reason, and again once it is released', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const operatorId = (await seedOperator(t.db, { role: 'owner' })).userId;
    const { holdId } = await setLegalHold(
      t.db,
      { userId, scope: 'messages', reason: REASON, reviewAt: '2026-12-18', operatorId },
      ERASED_AT,
    );
    const mirror = makeFakeLedgerMirror();

    await mirrorLegalHold(t.db, holdId, { mirror });
    expect(mirror.holds).toEqual([
      {
        holdId,
        userId,
        orgId: null,
        scope: 'messages',
        reviewAt: '2026-12-18',
        createdBy: operatorId,
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        releasedAt: null,
        releasedBy: null,
      },
    ]);
    expect(JSON.stringify(mirror.holds)).not.toContain('Subpoena');

    await releaseLegalHold(t.db, { holdId, operatorId }, NOW);
    await mirrorLegalHold(t.db, holdId, { mirror });
    expect(mirror.holds).toHaveLength(1);
    expect(mirror.holds[0]).toMatchObject({
      holdId,
      releasedAt: NOW.toISOString(),
      releasedBy: operatorId,
    });
  });

  it('ignores an unknown hold id', async () => {
    const mirror = makeFakeLedgerMirror();
    await mirrorLegalHold(t.db, newId(), { mirror });
    expect(mirror.holds).toEqual([]);
  });

  it('keeps one file per hold in dev, replaced when the hold changes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ledger-232-'));
    try {
      const mirror = localLedgerMirror(dir);
      expect(await mirror.listHolds()).toEqual([]);
      const entry = {
        holdId: newId(),
        userId: null,
        orgId: newId(),
        scope: 'all' as const,
        reviewAt: '2026-12-18',
        createdBy: newId(),
        createdAt: '2026-11-18T10:00:00.000Z',
        releasedAt: null,
        releasedBy: null,
      };
      await mirror.putHold(entry);
      expect(await mirror.listHolds()).toEqual([entry]);
      const released = {
        ...entry,
        releasedAt: '2026-11-18T11:00:00.000Z',
        releasedBy: entry.createdBy,
      };
      await mirror.putHold(released);
      expect(await mirror.listHolds()).toEqual([released]);
      // The ledger entries live beside the holds and are listed apart from them.
      expect(await mirror.listSince(new Date(0))).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('lists no holds when no mirror is configured', async () => {
    await NOOP_LEDGER_MIRROR.putHold({
      holdId: newId(),
      userId: newId(),
      orgId: null,
      scope: 'all',
      reviewAt: '2026-12-18',
      createdBy: newId(),
      createdAt: '2026-11-18T10:00:00.000Z',
      releasedAt: null,
      releasedBy: null,
    });
    expect(await NOOP_LEDGER_MIRROR.listHolds()).toEqual([]);
  });
});
