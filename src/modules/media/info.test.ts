import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { deleteMedia, getMedia, getMediaInfo, readMedia, readMediaVariant } from './index';
import type { MediaKind, MediaStatus } from './kinds';
import { ObjectNotFoundError, memoryStorage } from './storage';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
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
  ownerUserId: string;
  ownerOrgId?: string;
  altText?: string;
}): Promise<string> {
  const id = newId();
  const variants = { '320': `${id}/320.webp`, '640': `${id}/640.webp`, '1280': `${id}/1280.webp` };
  await t.db.execute(sql`
    insert into app.media (id, owner_user_id, owner_org_id, kind, status, bucket, path,
      declared_mime, size_bytes, width, height, alt_text, variants)
    values (${id}, ${s.ownerUserId}, ${s.ownerOrgId ?? null}, ${s.kind}, ${s.status},
      'media-public', ${id}, 'image/jpeg', 1000, 1280, 960, ${s.altText ?? null},
      ${JSON.stringify(variants)}::jsonb)
  `);
  return id;
}

describe('getMediaInfo', () => {
  it('returns owner, kind and status for known ids and omits unknown ones', async () => {
    const user = await newUser();
    const org = await newOrg();
    const a = await seed({
      kind: 'housing_photo',
      status: 'approved',
      ownerUserId: user,
      ownerOrgId: org,
      altText: 'A bunk room',
    });
    const b = await seed({ kind: 'avatar', status: 'scanning', ownerUserId: user });
    const unknown = newId();

    const info = await getMediaInfo(t.db, [a, b, unknown, 'not-a-uuid']);

    expect([...info.keys()].sort()).toEqual([a, b].sort());
    expect(info.get(a)).toEqual({
      ownerOrgId: org,
      kind: 'housing_photo',
      status: 'approved',
      altText: 'A bunk room',
      width: 1280,
      height: 960,
    });
    expect(info.get(b)).toMatchObject({ ownerOrgId: null, kind: 'avatar', status: 'scanning' });
    expect((await getMediaInfo(t.db, [])).size).toBe(0);
  });
});

describe('readMediaVariant', () => {
  it('reads the bytes of an approved image variant', async () => {
    const user = await newUser();
    const id = await seed({ kind: 'housing_photo', status: 'approved', ownerUserId: user });
    const storage = memoryStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.write('media-public', `${id}/640.webp`, bytes, 'image/webp');

    expect(await readMediaVariant(t.db, storage, id, 640)).toEqual({ mime: 'image/webp', bytes });
    expect(await readMediaVariant(t.db, storage, id, 320)).toBeNull();
  });

  it('returns null for media that is not approved, or unknown', async () => {
    const user = await newUser();
    const id = await seed({ kind: 'housing_photo', status: 'scanning', ownerUserId: user });
    const storage = memoryStorage();
    await storage.write('media-public', `${id}/640.webp`, new Uint8Array([1]), 'image/webp');

    expect(await readMediaVariant(t.db, storage, id, 640)).toBeNull();
    expect(await readMediaVariant(t.db, storage, newId(), 640)).toBeNull();
  });
});

/** A private PDF (a resume), as the scan leaves an approved one: in media-private, no variants. */
async function seedResume(ownerUserId: string, status: MediaStatus): Promise<string> {
  const id = newId();
  const bucket = status === 'approved' ? 'media-private' : 'quarantine';
  await t.db.execute(sql`
    insert into app.media (id, owner_user_id, kind, status, bucket, path, declared_mime, size_bytes)
    values (${id}, ${ownerUserId}, 'resume', ${status}, ${bucket}, ${`${id}/resume.pdf`},
      'application/pdf', 1000)
  `);
  return id;
}

async function auditCount(action: string, subjectId: string): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    t.db,
    sql`select count(*)::int as n from app.audit_events
        where action = ${action} and subject_id = ${subjectId}`,
  );
  return row?.n ?? 0;
}

describe('getMedia', () => {
  it('returns owner, kind and status, or null for an unknown id', async () => {
    const user = await newUser();
    const id = await seedResume(user, 'scanning');
    expect(await getMedia(t.db, id)).toEqual({
      id,
      ownerUserId: user,
      ownerOrgId: null,
      kind: 'resume',
      status: 'scanning',
    });
    expect(await getMedia(t.db, newId())).toBeNull();
    expect(await getMedia(t.db, 'not-a-uuid')).toBeNull();
  });
});

describe('readMedia', () => {
  it('reads an approved private file and refuses one still scanning', async () => {
    const user = await newUser();
    const storage = memoryStorage();
    const bytes = new TextEncoder().encode('%PDF-1.7 resume');
    const approved = await seedResume(user, 'approved');
    await storage.write('media-private', `${approved}/resume.pdf`, bytes, 'application/pdf');
    expect(await readMedia(t.db, storage, approved)).toEqual(bytes);

    const scanning = await seedResume(user, 'scanning');
    await storage.write('quarantine', `${scanning}/resume.pdf`, bytes, 'application/pdf');
    await expect(readMedia(t.db, storage, scanning)).rejects.toMatchObject({ code: 'not_found' });
    await expect(readMedia(t.db, storage, newId())).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses an approved file in the public bucket', async () => {
    const user = await newUser();
    const id = await seed({ kind: 'housing_photo', status: 'approved', ownerUserId: user });
    await expect(readMedia(t.db, memoryStorage(), id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('deleteMedia', () => {
  it('deletes the stored objects and the row, audits once, and is a no-op the second time', async () => {
    const user = await newUser();
    const storage = memoryStorage();
    const id = await seedResume(user, 'approved');
    await storage.write(
      'media-private',
      `${id}/resume.pdf`,
      new Uint8Array([1]),
      'application/pdf',
    );

    await deleteMedia(t.db, storage, id);

    expect(await getMedia(t.db, id)).toBeNull();
    await expect(storage.read('media-private', `${id}/resume.pdf`)).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
    expect(await auditCount('media.removed', id)).toBe(1);

    await deleteMedia(t.db, storage, id);
    expect(await auditCount('media.removed', id)).toBe(1);
  });

  it('removes every image variant', async () => {
    const user = await newUser();
    const storage = memoryStorage();
    const id = await seed({ kind: 'avatar', status: 'approved', ownerUserId: user });
    for (const w of ['320', '640', '1280']) {
      await storage.write('media-public', `${id}/${w}.webp`, new Uint8Array([1]), 'image/webp');
    }
    await deleteMedia(t.db, storage, id);
    expect(storage.list('media-public').filter((p) => p.startsWith(id))).toEqual([]);
  });
});
