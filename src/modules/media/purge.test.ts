import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { purgeBlockedMedia } from './index';
import type { MediaStatus } from './kinds';
import { memoryStorage } from './storage';

const BYTES = new Uint8Array([1, 2, 3]);

let t: TestDb;
let ownerUserId: string;

beforeAll(async () => {
  t = await createTestDb();
  ownerUserId = newId();
  await t.db.execute(
    sql`insert into app.users (id, clerk_user_id) values (${ownerUserId}, ${ownerUserId})`,
  );
});

afterAll(async () => {
  await t.close();
});

async function seed(status: MediaStatus): Promise<string> {
  const id = newId();
  const bucket = status === 'blocked' ? 'evidence' : 'media-public';
  await t.db.execute(sql`
    insert into app.media (id, owner_user_id, kind, status, bucket, path, declared_mime, size_bytes)
    values (${id}, ${ownerUserId}, 'listing_photo', ${status}, ${bucket}, ${id}, 'image/jpeg', 3)
  `);
  return id;
}

async function exists(id: string): Promise<boolean> {
  const rows = await queryRows(t.db, sql`select 1 from app.media where id = ${id}`);
  return rows.length === 1;
}

describe('purgeBlockedMedia', () => {
  it('deletes the evidence object, the quarantine copy and the row of a blocked file', async () => {
    const storage = memoryStorage();
    const id = await seed('blocked');
    await storage.write('evidence', id, BYTES, 'image/jpeg');
    await storage.write('quarantine', id, BYTES, 'image/jpeg');

    expect(await purgeBlockedMedia(t.db, id, storage)).toBe(true);

    expect(storage.has('evidence', id)).toBe(false);
    expect(storage.has('quarantine', id)).toBe(false);
    expect(await exists(id)).toBe(false);
    const audit = await queryRows<{ data: unknown }>(
      t.db,
      sql`select data from app.audit_events
          where action = 'media.evidence_purged' and subject_id = ${id}`,
    );
    expect(audit).toEqual([{ data: { kind: 'listing_photo' } }]);
  });

  it('returns false for an approved file and removes nothing', async () => {
    const storage = memoryStorage();
    const id = await seed('approved');
    await storage.write('media-public', id, BYTES, 'image/jpeg');
    await storage.write('evidence', id, BYTES, 'image/jpeg');
    await storage.write('quarantine', id, BYTES, 'image/jpeg');

    expect(await purgeBlockedMedia(t.db, id, storage)).toBe(false);

    expect(storage.has('media-public', id)).toBe(true);
    expect(storage.has('evidence', id)).toBe(true);
    expect(storage.has('quarantine', id)).toBe(true);
    expect(await exists(id)).toBe(true);
  });

  it('returns false for an unknown or malformed id', async () => {
    const storage = memoryStorage();
    expect(await purgeBlockedMedia(t.db, newId(), storage)).toBe(false);
    expect(await purgeBlockedMedia(t.db, 'not-a-uuid', storage)).toBe(false);
  });

  it('a second call after a purge returns false', async () => {
    const storage = memoryStorage();
    const id = await seed('blocked');

    expect(await purgeBlockedMedia(t.db, id, storage)).toBe(true);
    expect(await purgeBlockedMedia(t.db, id, storage)).toBe(false);
  });
});
