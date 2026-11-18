import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, MediaColumnRef, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedMedia } from '@tests/helpers/sp8';
import { readMediaForExport } from './export';
import { eraseMedia, privacyHandler } from './privacy';
import { memoryStorage } from './storage';

const NOW = new Date('2026-11-18T12:00:00Z');
const POSTS: MediaColumnRef[] = [{ table: 'community_posts', column: 'media_id', array: false }];

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  // Stands in for a later module that keeps a record pointing at a photo.
  await t.db.execute(sql`
    create table app.community_posts (
      id uuid primary key,
      media_id uuid references app.media (id),
      gallery uuid[] not null default '{}'
    )
  `);
});

afterAll(async () => {
  await t.close();
});

const erase = (s: PrivacySubject, holds: HoldScope[] = []) =>
  withTx(t.db, (tx) => privacyHandler.erase(tx, s, { requestId: newId(), now: NOW, holds }));

const statusOf = async (id: string) =>
  (await queryRows<{ status: string }>(t.db, sql`select status from app.media where id = ${id}`))[0]
    ?.status ?? null;

const cleanupFor = (mediaId: string) =>
  queryRows<{ payload: { mediaId: string; objects: { bucket: string; path: string }[] } }>(
    t.db,
    sql`select payload from app.outbox
        where topic = 'media.cleanup' and payload->>'mediaId' = ${mediaId}`,
  );

describe('media privacy handler', () => {
  it('deletes the files with every stored copy, and keeps child-safety evidence', async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Untouched Outfitters' });
    const avatar = await seedMedia(t.db, org.orgId, 'logo');
    const rejected = await seedMedia(t.db, org.orgId, 'listing_photo', 'rejected');
    const blocked = await seedMedia(t.db, org.orgId, 'listing_photo', 'blocked');
    const theirs = await seedMedia(t.db, other.orgId, 'logo');
    const subject = { kind: 'user' as const, userId: org.owner.userId };

    const first = await erase(subject);
    expect(first).toEqual({
      erased: 2,
      retained: [{ table: 'media', reason: 'safety', until: null }],
    });
    expect(await statusOf(avatar)).toBeNull();
    expect(await statusOf(rejected)).toBeNull();
    expect(await statusOf(blocked)).toBe('blocked');
    expect(await statusOf(theirs)).toBe('approved');

    const [job] = await cleanupFor(avatar);
    expect(job?.payload.objects).toEqual(
      expect.arrayContaining([
        { bucket: 'media-public', path: `${avatar}/320.webp` },
        { bucket: 'media-public', path: `${avatar}/640.webp` },
        { bucket: 'media-public', path: `${avatar}/1280.webp` },
        { bucket: 'media-public', path: avatar },
        { bucket: 'quarantine', path: avatar },
      ]),
    );
    expect((await cleanupFor(rejected))[0]?.payload.objects).toEqual([
      { bucket: 'quarantine', path: rejected },
    ]);
    expect(await cleanupFor(blocked)).toEqual([]);
    expect(await cleanupFor(theirs)).toEqual([]);

    expect(await erase(subject)).toEqual({ erased: 0, retained: first.retained });
    expect(await cleanupFor(avatar)).toHaveLength(1);
  });

  it('erases an organization by its own files only', async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Untouched Outfitters' });
    const logo = await seedMedia(t.db, org.orgId, 'logo');
    const theirs = await seedMedia(t.db, other.orgId, 'logo');
    expect(await erase({ kind: 'org', orgId: org.orgId })).toEqual({ erased: 1, retained: [] });
    expect(await statusOf(logo)).toBeNull();
    expect(await statusOf(theirs)).toBe('approved');
  });

  it('erases nothing under a hold on everything', async () => {
    const org = await seedHostOrg(t.db);
    const logo = await seedMedia(t.db, org.orgId, 'logo');
    const subject = { kind: 'org' as const, orgId: org.orgId };
    const held = await erase(subject, ['all']);
    expect(held).toEqual({
      erased: 0,
      retained: [{ table: 'media', reason: 'legal_hold', until: null }],
    });
    expect(await statusOf(logo)).toBe('approved');
    expect(await cleanupFor(logo)).toEqual([]);
  });

  it('keeps a file a kept record still references, with no foreign-key error', async () => {
    const org = await seedHostOrg(t.db);
    const photo = await seedMedia(t.db, org.orgId, 'community_photo');
    const inGallery = await seedMedia(t.db, org.orgId, 'community_photo');
    const unused = await seedMedia(t.db, org.orgId, 'community_photo');
    await t.db.execute(sql`
      insert into app.community_posts (id, media_id, gallery)
      values (${newId()}, ${photo}, array[${inGallery}]::uuid[])
    `);
    const subject = { kind: 'user' as const, userId: org.owner.userId };
    const columns: MediaColumnRef[] = [
      ...POSTS,
      { table: 'community_posts', column: 'gallery', array: true },
      // A column of a table that has not been migrated yet must not break the eraser.
      { table: 'not_migrated_yet', column: 'media_id', array: false },
    ];

    // A post held under a `reports` hold was kept by its own module's step.
    const held = await withTx(t.db, (tx) => eraseMedia(tx, subject, { holds: ['reports'] }, columns));
    expect(held).toEqual({
      erased: 1,
      retained: [{ table: 'media', reason: 'legal_hold', until: null }],
    });
    expect(await statusOf(photo)).toBe('approved');
    expect(await statusOf(inGallery)).toBe('approved');
    expect(await statusOf(unused)).toBeNull();
    expect(await cleanupFor(photo)).toEqual([]);
    expect(await cleanupFor(inGallery)).toEqual([]);

    // With no hold, the record that keeps it is someone else's shared record.
    const shared = await withTx(t.db, (tx) => eraseMedia(tx, subject, { holds: [] }, columns));
    expect(shared).toEqual({
      erased: 0,
      retained: [{ table: 'media', reason: 'shared_record', until: null }],
    });

    // Once nothing references the files, they go.
    await t.db.execute(sql`delete from app.community_posts`);
    const gone = await withTx(t.db, (tx) => eraseMedia(tx, subject, { holds: [] }, columns));
    expect(gone).toEqual({ erased: 2, retained: [] });
  });

  it('exports the approved files a person uploaded, under the names the archive uses', async () => {
    const org = await seedHostOrg(t.db);
    const logo = await seedMedia(t.db, org.orgId, 'logo');
    await seedMedia(t.db, org.orgId, 'listing_photo', 'rejected');
    await seedMedia(t.db, org.orgId, 'listing_photo', 'blocked');

    const part = await privacyHandler.exportData(t.db, { kind: 'user', userId: org.owner.userId });
    expect(part.files).toEqual([{ mediaId: logo, name: `logo-${logo}.webp` }]);
    expect(part.records.uploads).toEqual([
      expect.objectContaining({ file: `logo-${logo}.webp`, kind: 'logo' }),
    ]);
    expect(
      await privacyHandler.exportData(t.db, { kind: 'org', orgId: org.orgId }),
    ).toEqual({ records: { uploads: [] }, files: [] });
  });
});

describe('readMediaForExport', () => {
  it('reads the 1280 px variant of an image and a stored PDF', async () => {
    const org = await seedHostOrg(t.db);
    const storage = memoryStorage();
    const logo = await seedMedia(t.db, org.orgId, 'logo');
    await storage.write('media-public', `${logo}/1280.webp`, new Uint8Array([1, 2]), 'image/webp');
    expect(await readMediaForExport(t.db, storage, logo)).toEqual({
      name: `logo-${logo}.webp`,
      mime: 'image/webp',
      bytes: new Uint8Array([1, 2]),
    });

    const resume = newId();
    await t.db.execute(sql`
      insert into app.media (id, owner_user_id, kind, status, bucket, path, declared_mime, size_bytes)
      values (${resume}, ${org.owner.userId}, 'resume', 'approved', 'media-private',
        ${`${resume}.pdf`}, 'application/pdf', 10)
    `);
    await storage.write('media-private', `${resume}.pdf`, new Uint8Array([9]), 'application/pdf');
    expect(await readMediaForExport(t.db, storage, resume)).toEqual({
      name: `resume-${resume}.pdf`,
      mime: 'application/pdf',
      bytes: new Uint8Array([9]),
    });
  });

  it('returns null for a missing object, a file that is not approved, or an unknown id', async () => {
    const org = await seedHostOrg(t.db);
    const storage = memoryStorage();
    const missing = await seedMedia(t.db, org.orgId, 'logo');
    const blocked = await seedMedia(t.db, org.orgId, 'listing_photo', 'blocked');
    expect(await readMediaForExport(t.db, storage, missing)).toBeNull();
    expect(await readMediaForExport(t.db, storage, blocked)).toBeNull();
    expect(await readMediaForExport(t.db, storage, newId())).toBeNull();
    expect(await readMediaForExport(t.db, storage, 'not-a-uuid')).toBeNull();
  });
});
