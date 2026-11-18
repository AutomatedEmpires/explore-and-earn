// The restore drill's own checks (SP8 spec 8.11). They run only inside restore-drill.yml, which
// sets RESTORE_DRILL=1 after it has restored the newest backup into its throwaway Postgres and
// replayed the deletions made since. In the normal integration job this file is skipped.
//
// Needs DATABASE_URL (the restored database), RESTORE_TAKEN_AT (the manifest's `takenAt`) and
// the backup project keys, to read the deletion ledger mirror.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeClient, createDb, queryRows, type Db } from '@/lib/db';
import { engineLedgerMirror } from '@/server/ops/replay-deletions';

const drill = process.env.RESTORE_DRILL === '1';

describe.skipIf(!drill)('restore drill', () => {
  let db: Db;
  let takenAt: Date;

  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('The restore drill needs DATABASE_URL');
    takenAt = new Date(process.env.RESTORE_TAKEN_AT ?? '');
    if (Number.isNaN(takenAt.getTime())) {
      throw new Error('The restore drill needs RESTORE_TAKEN_AT (the manifest takenAt)');
    }
    db = createDb(url);
  });

  afterAll(async () => {
    if (db) await closeClient(db);
  });

  it('every user erased since the backup is erased in the restored database', async () => {
    const mirror = await engineLedgerMirror();
    const entries = await mirror.listSince(takenAt);

    const stillThere: string[] = [];
    for (const entry of entries) {
      const [user] = await queryRows<{ erased: boolean }>(
        db,
        sql`
          select (u.deleted_at is not null and u.erased_clerk_id_sha256 is not null
            and exists (select 1 from app.privacy_deletion_ledger l where l.user_id = u.id)
          ) as erased
          from app.users u where u.id = ${entry.userId}::uuid
        `,
      );
      // A user created and erased after the backup is not in the restored database at all.
      if (user && !user.erased) stillThere.push(entry.ledgerId);
    }

    expect(stillThere).toEqual([]);
  });

  it('schema_migrations lists every file in drizzle/', async () => {
    const files = readdirSync(path.resolve('drizzle'))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const rows = await queryRows<{ name: string }>(
      db,
      sql`select name from app.schema_migrations order by name`,
    );

    expect(rows.map((row) => row.name)).toEqual(files);
  });
});

describe.skipIf(drill)('restore drill (not running)', () => {
  it('is skipped unless restore-drill.yml sets RESTORE_DRILL=1', () => {
    expect(process.env.RESTORE_DRILL).not.toBe('1');
  });
});
