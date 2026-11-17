import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { newId } from '@/lib/ids';
import {
  getAuthorizedMediaUrl,
  getMediaMeta,
  getPublicMediaUrls,
} from './index';
import type { MediaKind, MediaStatus } from './kinds';
import { scanMedia } from './scan';
import { stubChildSafetyScanner, stubMalwareScanner } from './scanners';
import { getStorage, memoryStorage, type MemoryStorage } from './storage';
import { completeUpload, requestUpload } from './uploads';

vi.mock('@/modules/trust', () => ({
  openReviewItem: vi.fn(async () => ({ id: 'item' })),
  registerSubjectHandlers: vi.fn(),
  findLatestCheck: vi.fn(async () => null),
  runCheck: vi.fn(async () => ({
    checkId: 'check',
    decision: 'approved',
    score: 0.02,
    labels: [],
    reason: 'fake',
  })),
}));

vi.mock('@/modules/notifications', () => ({
  notify: vi.fn(async () => {}),
  defineType: vi.fn(),
  jobHandlers: {},
}));

const FIXTURES = path.resolve('tests/fixtures/media');
const fixture = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));
const EICAR = Buffer.from(
  ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''),
  'latin1',
);

let t: TestDb;
let storage: MemoryStorage;

beforeAll(async () => {
  vi.stubEnv('STORAGE_PROVIDER', 'stub');
  vi.stubEnv('CHILD_SAFETY_PROVIDER', 'stub');
  vi.stubEnv('MALWARE_PROVIDER', 'stub');
  resetEnvCache();
  storage = getStorage() as MemoryStorage;
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
  vi.unstubAllEnvs();
  resetEnvCache();
});

beforeEach(async () => {
  storage = getStorage() as MemoryStorage;
  await t.db.execute(sql`delete from app.media`);
  await t.db.execute(sql`delete from app.outbox`);
});

async function uploaded(kind: MediaKind, mime: string, bytes: Uint8Array) {
  const userId = newId();
  await t.db.execute(sql`insert into app.users (id, clerk_user_id) values (${userId}, ${userId})`);
  const { mediaId } = await requestUpload(t.db, storage, { userId }, {
    kind,
    mime,
    sizeBytes: bytes.byteLength,
  });
  await storage.write('quarantine', mediaId, bytes, mime);
  await completeUpload(t.db, { userId }, mediaId);
  return { userId, mediaId };
}

const deps = () => ({
  storage,
  childSafety: stubChildSafetyScanner(),
  malware: stubMalwareScanner(),
});

describe('attachment malware scan', () => {
  it('rejects an attachment image the stub malware scanner flags', async () => {
    const png = new Uint8Array([...fixture('gps.png'), ...EICAR]);
    const { mediaId } = await uploaded('attachment', 'image/png', png);
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('rejected');
    const [row] = await queryRows<{ rejection_reason: string; bucket: string }>(
      t.db,
      sql`select rejection_reason, bucket from app.media where id = ${mediaId}`,
    );
    expect(row?.rejection_reason).toBe('malware');
  });

  it('approves a clean attachment image into media-private with variants', async () => {
    const { mediaId } = await uploaded('attachment', 'image/png', fixture('gps.png'));
    expect(await scanMedia(t.db, deps(), mediaId)).toBe('approved');
    const [row] = await queryRows<{ bucket: string; variants: Record<string, string> | null }>(
      t.db,
      sql`select bucket, variants from app.media where id = ${mediaId}`,
    );
    expect(row?.bucket).toBe('media-private');
    expect(row?.variants).toEqual({
      '320': `${mediaId}/320.webp`,
      '640': `${mediaId}/640.webp`,
      '1280': `${mediaId}/1280.webp`,
    });
  });
});

describe('authorized urls and media meta', () => {
  beforeEach(() => {
    storage = memoryStorage();
  });

  async function newUser(): Promise<string> {
    const id = newId();
    await t.db.execute(sql`insert into app.users (id, clerk_user_id) values (${id}, ${id})`);
    return id;
  }

  async function newOrg(): Promise<string> {
    const id = newId();
    await t.db.execute(
      sql`insert into app.organizations (id, clerk_org_id, name, slug) values (${id}, ${id}, 'Org', ${id})`,
    );
    return id;
  }

  async function seed(s: {
    kind: MediaKind;
    status: MediaStatus;
    bucket: 'media-public' | 'media-private' | 'quarantine';
    ownerUserId: string;
    ownerOrgId?: string | null;
    declared: string;
    detected?: string | null;
    size?: number;
    pdf?: boolean;
  }): Promise<string> {
    const id = newId();
    const objectPath = s.pdf ? `${id}.pdf` : `${id}/1280.webp`;
    const variants = s.pdf ? null : { '320': `${id}/320.webp`, '640': `${id}/640.webp`, '1280': objectPath };
    await t.db.execute(sql`
      insert into app.media (id, owner_user_id, owner_org_id, kind, status, bucket, path,
        declared_mime, detected_mime, size_bytes, variants)
      values (${id}, ${s.ownerUserId}, ${s.ownerOrgId ?? null}, ${s.kind}, ${s.status}, ${s.bucket},
        ${s.pdf ? objectPath : id}, ${s.declared}, ${s.detected === undefined ? s.declared : s.detected},
        ${s.size ?? 1000}, ${variants ? JSON.stringify(variants) : null}::jsonb)
    `);
    await storage.write(s.bucket, s.pdf ? objectPath : objectPath, new Uint8Array([1]), s.declared);
    if (!s.pdf) {
      await storage.write(s.bucket, `${id}/320.webp`, new Uint8Array([1]), 'image/webp');
      await storage.write(s.bucket, `${id}/640.webp`, new Uint8Array([1]), 'image/webp');
    }
    return id;
  }

  it('signs an approved private attachment and refuses a file still scanning', async () => {
    const owner = await newUser();
    const approved = await seed({
      kind: 'attachment',
      status: 'approved',
      bucket: 'media-private',
      ownerUserId: owner,
      declared: 'image/png',
    });
    const scanning = await seed({
      kind: 'avatar',
      status: 'scanning',
      bucket: 'quarantine',
      ownerUserId: owner,
      declared: 'image/png',
    });
    await expect(getAuthorizedMediaUrl(t.db, storage, approved)).resolves.toBe(
      `memory://media-private/${approved}/1280.webp?expiresIn=300`,
    );
    await expect(getAuthorizedMediaUrl(t.db, storage, scanning)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('returns public urls only for approved public files', async () => {
    const owner = await newUser();
    const avatar = await seed({
      kind: 'avatar',
      status: 'approved',
      bucket: 'media-public',
      ownerUserId: owner,
      declared: 'image/jpeg',
    });
    const attachment = await seed({
      kind: 'attachment',
      status: 'approved',
      bucket: 'media-private',
      ownerUserId: owner,
      declared: 'image/jpeg',
    });
    const scanning = await seed({
      kind: 'avatar',
      status: 'scanning',
      bucket: 'quarantine',
      ownerUserId: owner,
      declared: 'image/jpeg',
    });
    const urls = await getPublicMediaUrls(t.db, storage, [avatar, attachment, scanning], 1280);
    expect(urls.get(avatar)).toBe(`memory://media-public/${avatar}/1280.webp`);
    expect(urls.has(attachment)).toBe(false);
    expect(urls.has(scanning)).toBe(false);
  });

  it('reports detected mime, falling back to declared, and skips unknown ids', async () => {
    const owner = await newUser();
    const orgId = await newOrg();
    const pdf = await seed({
      kind: 'attachment',
      status: 'approved',
      bucket: 'media-private',
      ownerUserId: owner,
      ownerOrgId: orgId,
      declared: 'application/pdf',
      detected: 'application/pdf',
      size: 4096,
      pdf: true,
    });
    const swapped = await seed({
      kind: 'avatar',
      status: 'approved',
      bucket: 'media-public',
      ownerUserId: owner,
      declared: 'image/jpeg',
      detected: 'image/png',
    });
    const fallback = await seed({
      kind: 'avatar',
      status: 'approved',
      bucket: 'media-public',
      ownerUserId: owner,
      declared: 'image/jpeg',
      detected: null,
    });
    const meta = await getMediaMeta(t.db, [pdf, swapped, fallback, newId()]);
    expect(meta.get(pdf)).toEqual({
      ownerUserId: owner,
      ownerOrgId: orgId,
      kind: 'attachment',
      status: 'approved',
      mime: 'application/pdf',
      sizeBytes: 4096,
    });
    expect(meta.get(swapped)?.mime).toBe('image/png');
    expect(meta.get(fallback)?.mime).toBe('image/jpeg');
    expect(meta.has(newId())).toBe(false);
  });
});
