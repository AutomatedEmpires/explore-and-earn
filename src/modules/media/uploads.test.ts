import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { KIND_RULES, MEDIA_KINDS } from './kinds';
import { localStorage, memoryStorage, ObjectNotFoundError, verifyLocalToken } from './storage';
import { completeUpload, requestUpload } from './uploads';

const MB = 1024 * 1024;

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.outbox`);
  await t.db.execute(sql`truncate app.media, app.users cascade`);
});

async function newUser(): Promise<string> {
  const id = newId();
  await t.db.execute(
    sql`insert into app.users (id, clerk_user_id) values (${id}, ${`user_${id}`})`,
  );
  return id;
}

type MediaRow = {
  id: string;
  owner_user_id: string;
  owner_org_id: string | null;
  kind: string;
  status: string;
  bucket: string;
  path: string;
  declared_mime: string;
  size_bytes: number;
};

const mediaRows = () =>
  queryRows<MediaRow>(
    t.db,
    sql`select id, owner_user_id, owner_org_id, kind, status, bucket, path, declared_mime,
          size_bytes from app.media order by id`,
  );

const scanJobs = () =>
  queryRows<{ topic: string; dedupe_key: string; payload: unknown }>(
    t.db,
    sql`select topic, dedupe_key, payload from app.outbox where topic = 'media.scan'`,
  );

describe('KIND_RULES', () => {
  it('never allows SVG for any kind', () => {
    for (const kind of MEDIA_KINDS) {
      expect(KIND_RULES[kind].mimes).not.toContain('image/svg+xml');
    }
  });

  it('allows the image types up to 15 MB, resumes as PDF up to 10 MB', () => {
    expect(KIND_RULES.listing_photo).toEqual({
      mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
      maxBytes: 15 * MB,
    });
    expect(KIND_RULES.resume).toEqual({ mimes: ['application/pdf'], maxBytes: 10 * MB });
    expect(KIND_RULES.attachment).toEqual({
      mimes: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'],
      maxBytes: 10 * MB,
    });
  });
});

describe('requestUpload', () => {
  it('rejects an SVG avatar with bad_request (Review Focus 3, request side)', async () => {
    const userId = await newUser();
    await expect(
      requestUpload(
        t.db,
        memoryStorage(),
        { userId },
        {
          kind: 'avatar',
          mime: 'image/svg+xml',
          sizeBytes: 2_000,
        },
      ),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(await mediaRows()).toEqual([]);
  });

  it('rejects a 16 MB listing photo', async () => {
    const userId = await newUser();
    await expect(
      requestUpload(
        t.db,
        memoryStorage(),
        { userId },
        {
          kind: 'listing_photo',
          mime: 'image/jpeg',
          sizeBytes: 16 * MB,
        },
      ),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(await mediaRows()).toEqual([]);
  });

  it('rejects a type the kind does not allow, and a non-positive size', async () => {
    const userId = await newUser();
    const storage = memoryStorage();
    await expect(
      requestUpload(
        t.db,
        storage,
        { userId },
        { kind: 'resume', mime: 'image/jpeg', sizeBytes: 10 },
      ),
    ).rejects.toMatchObject({ code: 'bad_request' });
    await expect(
      requestUpload(t.db, storage, { userId }, { kind: 'avatar', mime: 'image/png', sizeBytes: 0 }),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('creates the row in quarantine and returns an upload URL from storage', async () => {
    const userId = await newUser();
    const storage = memoryStorage();
    const res = await requestUpload(
      t.db,
      storage,
      { userId },
      {
        kind: 'listing_photo',
        mime: 'Image/JPEG',
        sizeBytes: 3 * MB,
      },
    );

    expect(res.mediaId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(res.uploadUrl).toContain(`quarantine/${res.mediaId}`);
    expect(res.token).not.toBe('');

    expect(await mediaRows()).toEqual([
      {
        id: res.mediaId,
        owner_user_id: userId,
        owner_org_id: null,
        kind: 'listing_photo',
        status: 'uploaded',
        bucket: 'quarantine',
        path: res.mediaId,
        declared_mime: 'image/jpeg',
        size_bytes: 3 * MB,
      },
    ]);
  });
});

describe('completeUpload', () => {
  async function requested() {
    const userId = await newUser();
    const { mediaId } = await requestUpload(
      t.db,
      memoryStorage(),
      { userId },
      {
        kind: 'resume',
        mime: 'application/pdf',
        sizeBytes: 50_000,
      },
    );
    return { userId, mediaId };
  }

  it('is forbidden to anyone but the owner', async () => {
    const { mediaId } = await requested();
    const stranger = await newUser();
    await expect(completeUpload(t.db, { userId: stranger }, mediaId)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect((await mediaRows())[0]?.status).toBe('uploaded');
    expect(await scanJobs()).toEqual([]);
  });

  it('returns not_found for an unknown media id', async () => {
    const userId = await newUser();
    await expect(completeUpload(t.db, { userId }, newId())).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('sets scanning and enqueues one media.scan job, even when called twice', async () => {
    const { userId, mediaId } = await requested();
    await completeUpload(t.db, { userId }, mediaId);
    await completeUpload(t.db, { userId }, mediaId);

    expect((await mediaRows())[0]?.status).toBe('scanning');
    expect(await scanJobs()).toEqual([
      { topic: 'media.scan', dedupe_key: `scan:${mediaId}`, payload: { mediaId } },
    ]);
  });
});

describe('localStorage (dev adapter)', () => {
  it('round-trips files, refuses unsafe paths, and signs URLs only for one purpose and object', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ee-media-'));
    const secret = 's'.repeat(32);
    try {
      const s = localStorage(dir, { baseUrl: 'http://localhost:3000/', secret });
      await s.write('quarantine', 'abc', new Uint8Array([1, 2, 3]), 'image/png');
      expect([...(await s.read('quarantine', 'abc'))]).toEqual([1, 2, 3]);

      await s.copy(
        { bucket: 'quarantine', path: 'abc' },
        { bucket: 'media-public', path: 'abc/320.webp' },
      );
      expect([...(await s.read('media-public', 'abc/320.webp'))]).toEqual([1, 2, 3]);
      expect(s.publicUrl('media-public', 'abc/320.webp')).toBe(
        'http://localhost:3000/api/v1/media/local/media-public/abc/320.webp',
      );

      await expect(s.read('quarantine', 'missing')).rejects.toBeInstanceOf(ObjectNotFoundError);
      await expect(s.write('quarantine', '../escape', new Uint8Array([1]), 'x')).rejects.toThrow(
        /Unsafe object path/,
      );

      const { url, token } = await s.signedUploadUrl('quarantine', 'abc');
      expect(url.startsWith('http://localhost:3000/api/v1/media/local/quarantine/abc?token=')).toBe(
        true,
      );
      expect(verifyLocalToken(secret, 'upload', 'quarantine', 'abc', token)).toBe(true);
      expect(verifyLocalToken(secret, 'read', 'quarantine', 'abc', token)).toBe(false);
      expect(verifyLocalToken(secret, 'upload', 'quarantine', 'abd', token)).toBe(false);
      expect(verifyLocalToken('t'.repeat(32), 'upload', 'quarantine', 'abc', token)).toBe(false);
      const expiry = Number(token.split('.')[0]);
      expect(verifyLocalToken(secret, 'upload', 'quarantine', 'abc', token, expiry + 1)).toBe(
        false,
      );

      await s.remove('quarantine', 'abc');
      await s.remove('quarantine', 'abc');
      await expect(s.read('quarantine', 'abc')).rejects.toBeInstanceOf(ObjectNotFoundError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
