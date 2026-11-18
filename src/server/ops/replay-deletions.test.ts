import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { makeFakeLedgerMirror } from '../../../tests/fakes/sp8/ledger-mirror';
import { engineLedgerMirror, replayDeletions, type LedgerEntry } from './replay-deletions';

// The engine's replayErasure belongs to the privacy engine workstream; here it is a mock that
// does what the real one ends with: the user row marked deleted and the ledger row written.
const engine = vi.hoisted(() => ({ replayErasure: vi.fn(), getLedgerMirror: vi.fn() }));
vi.mock('@/modules/privacy', async (original) => ({
  ...(await original<typeof import('@/modules/privacy')>()),
  replayErasure: engine.replayErasure,
  getLedgerMirror: engine.getLedgerMirror,
}));

const SINCE = new Date('2026-11-03T02:00:00.000Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  vi.restoreAllMocks();
  engine.replayErasure.mockReset();
  engine.getLedgerMirror.mockReset();
});

async function seedUser(): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name)
    values (${id}, ${`user_${id}`}, ${`${id}@example.test`}, 'Maya Rodriguez')
  `);
  return id;
}

function entry(userId: string, erasedAt: string): LedgerEntry {
  return { ledgerId: newId(), userId, requestId: newId(), erasedAt };
}

/** What the engine's replayErasure leaves behind for one user. */
async function erase(db: Db, i: { userId: string; requestId: string }): Promise<{ modules: number }> {
  await db.execute(sql`
    update app.users
    set email = null, display_name = 'Deleted user', clerk_user_id = ${`deleted:${i.userId}`},
      erased_clerk_id_sha256 = ${`hash-${i.userId}`}, deleted_at = now()
    where id = ${i.userId}
  `);
  await db.execute(sql`
    insert into app.privacy_deletion_ledger (id, user_id, request_id, erased_at)
    values (${newId()}, ${i.userId}, ${i.requestId}, now())
    on conflict (user_id) do nothing
  `);
  return { modules: 1 };
}

async function emailOf(userId: string): Promise<string | null | undefined> {
  const [row] = await queryRows<{ email: string | null }>(
    t.db,
    sql`select email from app.users where id = ${userId}`,
  );
  return row?.email;
}

describe('replayDeletions', () => {
  it('is a dry run by default: it reports what it would replay and changes nothing', async () => {
    const userId = await seedUser();
    const mirror = makeFakeLedgerMirror();
    await mirror.put(entry(userId, '2026-11-03T05:00:00.000Z'));
    const replay = vi.fn(erase);

    const result = await replayDeletions(t.db, mirror, SINCE, { replay });

    expect(result).toEqual({ replayed: 0, skipped: 0, pending: 1, failed: [] });
    expect(replay).not.toHaveBeenCalled();
    expect(await emailOf(userId)).toBe(`${userId}@example.test`);
  });

  it('with apply, replays only entries since the restore point, then skips them on a second run', async () => {
    const before = await seedUser();
    const after = await seedUser();
    const mirror = makeFakeLedgerMirror();
    const old = entry(before, '2026-11-03T01:59:59.999Z');
    const fresh = entry(after, '2026-11-03T02:00:00.000Z');
    await mirror.put(old);
    await mirror.put(fresh);
    const replay = vi.fn(erase);

    const first = await replayDeletions(t.db, mirror, SINCE, { apply: true, replay });

    expect(first).toEqual({ replayed: 1, skipped: 0, pending: 0, failed: [] });
    expect(replay).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledWith(t.db, { userId: after, requestId: fresh.requestId });
    expect(await emailOf(after)).toBeNull();
    expect(await emailOf(before)).toBe(`${before}@example.test`);

    const second = await replayDeletions(t.db, mirror, SINCE, { apply: true, replay });

    expect(second).toEqual({ replayed: 0, skipped: 1, pending: 0, failed: [] });
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it('uses the privacy engine replayErasure when none is passed', async () => {
    const userId = await seedUser();
    const mirror = makeFakeLedgerMirror();
    const mirrored = entry(userId, '2026-11-03T03:00:00.000Z');
    await mirror.put(mirrored);
    engine.replayErasure.mockImplementation(erase);

    const result = await replayDeletions(t.db, mirror, SINCE, { apply: true });

    expect(result).toEqual({ replayed: 1, skipped: 0, pending: 0, failed: [] });
    expect(engine.replayErasure).toHaveBeenCalledWith(t.db, {
      userId,
      requestId: mirrored.requestId,
    });
  });

  it('replays a user who is marked deleted but has no ledger row', async () => {
    const userId = await seedUser();
    await t.db.execute(sql`update app.users set deleted_at = now() where id = ${userId}`);
    const mirror = makeFakeLedgerMirror();
    await mirror.put(entry(userId, '2026-11-03T03:00:00.000Z'));
    const replay = vi.fn(erase);

    const result = await replayDeletions(t.db, mirror, SINCE, { apply: true, replay });

    expect(result.replayed).toBe(1);
  });

  it('skips a user the restored database never held', async () => {
    const mirror = makeFakeLedgerMirror();
    await mirror.put(entry(newId(), '2026-11-03T03:00:00.000Z'));
    const replay = vi.fn(erase);

    const result = await replayDeletions(t.db, mirror, SINCE, { apply: true, replay });

    expect(result).toEqual({ replayed: 0, skipped: 1, pending: 0, failed: [] });
    expect(replay).not.toHaveBeenCalled();
  });

  it('goes on after a failing entry and reports its ledger ID, with no personal data logged', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const broken = await seedUser();
    const fine = await seedUser();
    const mirror = makeFakeLedgerMirror();
    const first = entry(broken, '2026-11-03T03:00:00.000Z');
    await mirror.put(first);
    await mirror.put(entry(fine, '2026-11-03T04:00:00.000Z'));
    const replay = vi.fn(async (db: Db, i: { userId: string; requestId: string }) => {
      if (i.userId === broken) throw new Error('step failed');
      return erase(db, i);
    });

    const result = await replayDeletions(t.db, mirror, SINCE, { apply: true, replay });

    expect(result).toEqual({ replayed: 1, skipped: 0, pending: 0, failed: [first.ledgerId] });
    expect(await emailOf(fine)).toBeNull();
    expect(JSON.stringify(error.mock.calls)).not.toContain('@example.test');
  });

  it('refuses a `since` that is not a date', async () => {
    await expect(
      replayDeletions(t.db, makeFakeLedgerMirror(), new Date('nope'), { apply: true }),
    ).rejects.toThrow(/not a date/);
  });

  it('engineLedgerMirror returns the privacy engine mirror', async () => {
    const mirror = makeFakeLedgerMirror();
    engine.getLedgerMirror.mockReturnValue(mirror);

    expect(await engineLedgerMirror()).toBe(mirror);
  });
});

const workflow = readFileSync(path.resolve('.github/workflows/restore-drill.yml'), 'utf8');
const code = workflow
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

describe('restore-drill.yml', () => {
  it('stays off until the founder turns it on: manual start only, behind a variable and an environment', () => {
    const on = /^on:\n((?:[ \t]+.*\n|\n)*)/m.exec(workflow)?.[1] ?? '';
    expect(on.trim()).toBe('workflow_dispatch:');
    expect(code).not.toMatch(/schedule:|cron:/);
    expect(code).toMatch(/if: vars\.RESTORE_DRILL_ENABLED == 'true'\n/);
    expect(code).toMatch(/environment: restore-drill\n/);
    expect(code).toMatch(/timeout-minutes: 480\n/);
  });

  it('restores into the throwaway service database and holds no production credentials', () => {
    expect(code).toMatch(/image: postgis\/postgis:17-3\.5\n/);
    expect(code).toMatch(/DATABASE_URL: postgres:\/\/postgres:postgres@localhost:5432\/postgres\n/);
    const names = [...new Set([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))];
    expect(names.sort()).toEqual([
      'BACKUP_CRYPT_PASSWORD',
      'BACKUP_CRYPT_SALT',
      'BACKUP_S3_ACCESS_KEY_ID',
      'BACKUP_S3_ENDPOINT',
      'BACKUP_S3_SECRET_ACCESS_KEY',
      'BACKUP_SUPABASE_SERVICE_ROLE_KEY',
      'BACKUP_SUPABASE_URL',
    ]);
    expect(workflow).not.toMatch(/PROD_|evidence/i);
    const runbook = readFileSync(path.resolve('docs/runbooks/restore.md'), 'utf8');
    for (const name of names) expect(runbook).toContain(`\`${name}\``);
  });

  it('runs the steps of the drill in order', () => {
    const steps = [
      'pg_restore --no-owner',
      'pnpm db:migrate',
      'pnpm backup:manifest --verify',
      'pnpm ops:replay-deletions --since "$RESTORE_TAKEN_AT" --apply',
      'pnpm test:integration tests/restore',
      'restore-summary.json',
    ];
    const positions = steps.map((step) => code.indexOf(step));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
