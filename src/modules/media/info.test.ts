import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { getMediaInfo, readMediaVariant } from './index';
import type { MediaKind, MediaStatus } from './kinds';
import { memoryStorage } from './storage';

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
