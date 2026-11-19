import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { releaseLegalHold, setLegalHold, type HoldScope, type MediaColumnRef } from '@/modules/privacy';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, seedListingRow } from '../../../tests/helpers/sp2';
import { seedOperator, seedSeeker } from '../../../tests/helpers/sp8';
import type { MediaStatus } from './kinds';
import {
  assertMediaColumnsDeclared,
  createMediaRetentionRules,
  retentionRules,
} from './retention';

const NOW = new Date('2026-11-03T17:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY_MS - extraMs);

/** The column the SP2 listing draft stores its photos in (a generated uuid[] over jsonb). */
const DRAFT_PHOTOS: MediaColumnRef = { table: 'listings', column: 'draft_media_ids', array: true };
const HERO: MediaColumnRef = { table: 'landing_pages', column: 'hero_media_id', array: false };

let t: TestDb;
let orgId: string;
let ownerUserId: string;
let operatorId: string;

beforeAll(async () => {
  t = await createTestDb();
  const org = await seedHostOrg(t.db);
  orgId = org.orgId;
  ownerUserId = org.owner.userId;
  operatorId = (await seedOperator(t.db, { role: 'owner' })).userId;
});

/** An open legal hold on one person or organization. */
async function hold(subject: { userId: string } | { orgId: string }, scope: HoldScope): Promise<string> {
  const { holdId } = await setLegalHold(
    t.db,
    { ...subject, scope, reason: 'Fraud investigation 26-311', reviewAt: '2026-12-01', operatorId },
    NOW,
  );
  return holdId;
}

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.outbox`);
  await t.db.execute(sql`delete from app.media`);
});

async function seed(o: {
  status: MediaStatus;
  createdAt: Date;
  updatedAt?: Date;
  /** Defaults to the host org's owner and the org. */
  owner?: { userId: string; orgId: string | null };
}): Promise<string> {
  const id = newId();
  const approved = o.status === 'approved';
  const variants = approved ? { '320': `${id}/320.webp`, '640': `${id}/640.webp` } : null;
  await t.db.execute(sql`
    insert into app.media (id, owner_user_id, owner_org_id, kind, status, bucket, path,
      declared_mime, size_bytes, variants, created_at, updated_at)
    values (${id}, ${o.owner?.userId ?? ownerUserId}, ${o.owner ? o.owner.orgId : orgId},
      'listing_photo', ${o.status},
      ${approved ? 'media-public' : 'quarantine'}, ${id}, 'image/jpeg', 1000,
      ${variants ? JSON.stringify(variants) : null}::jsonb,
      ${o.createdAt.toISOString()}::timestamptz,
      ${(o.updatedAt ?? o.createdAt).toISOString()}::timestamptz)
  `);
  return id;
}

async function remaining(): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(t.db, sql`select id from app.media`);
  return rows.map((row) => row.id);
}

async function cleanupJobs(): Promise<{ mediaId: string; objects: { bucket: string; path: string }[] }[]> {
  const rows = await queryRows<{ payload: { mediaId: string; objects: { bucket: string; path: string }[] } }>(
    t.db,
    sql`select payload from app.outbox where topic = 'media.cleanup'`,
  );
  return rows.map((row) => row.payload);
}

function rule(key: string, columns: readonly MediaColumnRef[] = []) {
  const found = createMediaRetentionRules(async () => columns).find((r) => r.key === key);
  if (!found) throw new Error(`no rule ${key}`);
  return found;
}

describe('media.uploads_stale', () => {
  it('uses the exact description', () => {
    expect(rule('media.uploads_stale').description).toBe(
      'Uploads that never finished or never passed scanning are deleted after 7 days.',
    );
  });

  it('keeps an upload exactly 7 days old and deletes one 1 ms older, with its object', async () => {
    const atLimit = await seed({ status: 'uploaded', createdAt: daysAgo(7) });
    const older = await seed({ status: 'scanning', createdAt: daysAgo(7, 1) });

    const result = await rule('media.uploads_stale').run(t.db, NOW, 100);

    expect(result).toEqual({ deleted: 1 });
    expect(await remaining()).toEqual([atLimit]);
    expect(await cleanupJobs()).toEqual([
      { mediaId: older, objects: [{ bucket: 'quarantine', path: older }] },
    ]);
  });

  it('deletes at most `limit` rows', async () => {
    for (let i = 0; i < 3; i++) await seed({ status: 'uploaded', createdAt: daysAgo(8) });

    expect(await rule('media.uploads_stale').run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    expect(await remaining()).toHaveLength(1);
  });

  it('keeps a stale upload whose owner has a hold of any scope', async () => {
    const seeker = (await seedSeeker(t.db)).userId;
    await hold({ userId: seeker }, 'messages');
    const held = await seed({
      status: 'uploaded',
      createdAt: daysAgo(30),
      owner: { userId: seeker, orgId: null },
    });
    const free = await seed({ status: 'uploaded', createdAt: daysAgo(30) });

    expect(await rule('media.uploads_stale').run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await remaining()).toEqual([held]);
    expect((await cleanupJobs()).map((job) => job.mediaId)).toEqual([free]);
  });

  it('never deletes a file that finished scanning, however old', async () => {
    const statuses: MediaStatus[] = ['approved', 'in_review', 'rejected', 'blocked'];
    for (const status of statuses) {
      const id = newId();
      await t.db.execute(sql`
        insert into app.media (id, owner_user_id, kind, status, bucket, path, declared_mime,
          size_bytes, rejection_reason, created_at, updated_at)
        values (${id}, ${ownerUserId}, 'listing_photo', ${status},
          ${status === 'blocked' ? 'evidence' : 'media-private'}, ${id}, 'image/jpeg', 1000,
          ${status === 'rejected' ? 'unsafe_content' : null},
          ${daysAgo(400).toISOString()}::timestamptz, ${NOW.toISOString()}::timestamptz)
      `);
    }

    expect(await rule('media.uploads_stale').run(t.db, NOW, 100)).toEqual({ deleted: 0 });
    expect(await remaining()).toHaveLength(4);
  });
});

describe('media.orphans', () => {
  it('uses the exact description', () => {
    expect(rule('media.orphans').description).toBe(
      'Uploaded files that nothing uses anymore are deleted after 30 days.',
    );
  });

  it('keeps an unused file exactly 30 days old and deletes one 1 ms older, with every copy', async () => {
    const atLimit = await seed({ status: 'approved', createdAt: daysAgo(30) });
    const older = await seed({ status: 'approved', createdAt: daysAgo(30, 1) });

    expect(await rule('media.orphans').run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await remaining()).toEqual([atLimit]);

    const [job] = await cleanupJobs();
    expect(job?.mediaId).toBe(older);
    expect(job?.objects).toEqual(
      expect.arrayContaining([
        { bucket: 'media-public', path: older },
        { bucket: 'media-public', path: `${older}/320.webp` },
        { bucket: 'media-public', path: `${older}/640.webp` },
        { bucket: 'quarantine', path: older },
      ]),
    );
  });

  it('goes by the last change, not the upload date', async () => {
    const recentlyUsed = await seed({
      status: 'approved',
      createdAt: daysAgo(200),
      updatedAt: daysAgo(29),
    });

    expect(await rule('media.orphans').run(t.db, NOW, 100)).toEqual({ deleted: 0 });
    expect(await remaining()).toEqual([recentlyUsed]);
  });

  it('deletes at most `limit` rows', async () => {
    for (let i = 0; i < 3; i++) await seed({ status: 'approved', createdAt: daysAgo(31) });

    expect(await rule('media.orphans').run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    expect(await remaining()).toHaveLength(1);
  });

  it('keeps a photo referenced only from jsonb, and deletes an unreferenced one (Review Focus 2)', async () => {
    const used = await seed({ status: 'approved', createdAt: daysAgo(31) });
    const unused31 = await seed({ status: 'approved', createdAt: daysAgo(31) });
    const unused29 = await seed({ status: 'approved', createdAt: daysAgo(29) });
    const listingId = await seedListingRow(t.db, { orgId });
    await t.db.execute(sql`
      update app.listings
      set draft = ${JSON.stringify({ photos: [{ mediaId: used, caption: 'The lodge' }] })}::jsonb
      where id = ${listingId}
    `);

    const result = await rule('media.orphans', [DRAFT_PHOTOS]).run(t.db, NOW, 100);

    expect(result).toEqual({ deleted: 1 });
    expect((await remaining()).sort()).toEqual([used, unused29].sort());
    expect((await cleanupJobs()).map((job) => job.mediaId)).toEqual([unused31]);
  });

  it('keeps a file a plain uuid column points at', async () => {
    const hero = await seed({ status: 'approved', createdAt: daysAgo(90) });
    const unused = await seed({ status: 'approved', createdAt: daysAgo(90) });
    await t.db.execute(sql`
      insert into app.landing_pages (key, kind, title, hero_media_id)
      values ('state:alaska', 'state', 'Jobs in Alaska', ${hero})
    `);

    try {
      expect(await rule('media.orphans', [HERO]).run(t.db, NOW, 100)).toEqual({ deleted: 1 });
      expect(await remaining()).toEqual([hero]);
      expect((await cleanupJobs()).map((job) => job.mediaId)).toEqual([unused]);
    } finally {
      await t.db.execute(sql`delete from app.landing_pages where key = 'state:alaska'`);
    }
  });

  it('keeps an unused file while its owner or its organization is under a hold (lead decision 2026-11-18)', async () => {
    // The review's case: a host under a fraud investigation swaps a listing's photos. The old
    // photos are no longer used, but the hold must keep them.
    const host = await seedHostOrg(t.db);
    const orgHold = await hold({ orgId: host.orgId }, 'reports');
    const seeker = (await seedSeeker(t.db)).userId;
    const userHold = await hold({ userId: seeker }, 'all');
    const byOrg = await seed({
      status: 'approved',
      createdAt: daysAgo(90),
      owner: { userId: host.owner.userId, orgId: host.orgId },
    });
    const byUser = await seed({
      status: 'approved',
      createdAt: daysAgo(90),
      owner: { userId: seeker, orgId: null },
    });
    const free = await seed({ status: 'approved', createdAt: daysAgo(90) });

    expect(await rule('media.orphans').run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect((await remaining()).sort()).toEqual([byOrg, byUser].sort());
    expect((await cleanupJobs()).map((job) => job.mediaId)).toEqual([free]);

    // Once both holds are released the next run deletes them.
    await releaseLegalHold(t.db, { holdId: orgHold, operatorId }, NOW);
    await releaseLegalHold(t.db, { holdId: userHold, operatorId }, NOW);
    expect(await rule('media.orphans').run(t.db, NOW, 100)).toEqual({ deleted: 2 });
    expect(await remaining()).toEqual([]);
  });

  it('refuses a column name that is not a plain identifier', async () => {
    await seed({ status: 'approved', createdAt: daysAgo(31) });
    const bad: MediaColumnRef = { table: 'listings; drop table app.media', column: 'x', array: false };

    await expect(rule('media.orphans', [bad]).run(t.db, NOW, 100)).rejects.toThrow(/bad media column/);
    expect(await remaining()).toHaveLength(1);
  });
});

describe('the registered media rules fail closed', () => {
  it('assertMediaColumnsDeclared names every undeclared media column', async () => {
    await expect(assertMediaColumnsDeclared(t.db, [DRAFT_PHOTOS])).rejects.toThrow(
      /Media retention refused: no privacy handler declares .*landing_pages\.hero_media_id/,
    );
  });

  it('assertMediaColumnsDeclared refuses a declared column that does not exist', async () => {
    const rows = await queryRows<{ table_name: string; column_name: string; data_type: string }>(
      t.db,
      sql`select table_name, column_name, data_type from information_schema.columns c
          where table_schema = 'app' and table_name <> 'media' and column_name like '%media_id%'
            and exists (select 1 from information_schema.tables t
              where t.table_schema = 'app' and t.table_name = c.table_name
                and t.table_type = 'BASE TABLE')`,
    );
    const all: MediaColumnRef[] = rows.map((row) => ({
      table: row.table_name,
      column: row.column_name,
      array: row.data_type === 'ARRAY',
    }));

    await expect(assertMediaColumnsDeclared(t.db, all)).resolves.toBeUndefined();
    await expect(
      assertMediaColumnsDeclared(t.db, [...all, { table: 'listings', column: 'gone_media_id', array: false }]),
    ).rejects.toThrow(/declared media columns do not exist: listings\.gone_media_id/);
  });

  it('with every media column declared, the rules delete only what nothing references', async () => {
    const rows = await queryRows<{ table_name: string; column_name: string; data_type: string }>(
      t.db,
      sql`select table_name, column_name, data_type from information_schema.columns c
          where table_schema = 'app' and table_name <> 'media' and column_name like '%media_id%'
            and exists (select 1 from information_schema.tables t
              where t.table_schema = 'app' and t.table_name = c.table_name
                and t.table_type = 'BASE TABLE')`,
    );
    const all: MediaColumnRef[] = rows.map((row) => ({
      table: row.table_name,
      column: row.column_name,
      array: row.data_type === 'ARRAY',
    }));
    const orphan = await seed({ status: 'approved', createdAt: daysAgo(31) });

    expect(await rule('media.orphans', all).run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await remaining()).not.toContain(orphan);
  });

  it('exports the two rules under their keys', () => {
    expect(retentionRules.map((r) => r.key)).toEqual(['media.uploads_stale', 'media.orphans']);
  });
});
