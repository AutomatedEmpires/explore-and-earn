import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import type { MediaKind, MediaStatus } from './kinds';
import { memoryStorage, type MemoryStorage } from './storage';
import { getMediaUrl, type MediaViewer } from './urls';

let t: TestDb;
let storage: MemoryStorage;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

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

type Seed = {
  kind: MediaKind;
  status: MediaStatus;
  bucket: 'quarantine' | 'media-public' | 'media-private' | 'evidence';
  ownerUserId: string;
  ownerOrgId?: string;
  pdf?: boolean;
};

/** A media row in the given state, with its objects present in storage. */
async function seed(s: Seed): Promise<string> {
  const id = newId();
  const objectPath = s.pdf ? `${id}.pdf` : id;
  const variants = s.pdf
    ? null
    : { '320': `${id}/320.webp`, '640': `${id}/640.webp`, '1280': `${id}/1280.webp` };
  await t.db.execute(sql`
    insert into app.media (id, owner_user_id, owner_org_id, kind, status, bucket, path,
      declared_mime, size_bytes, variants, rejection_reason)
    values (${id}, ${s.ownerUserId}, ${s.ownerOrgId ?? null}, ${s.kind}, ${s.status}, ${s.bucket},
      ${objectPath}, ${s.pdf ? 'application/pdf' : 'image/jpeg'}, 1000,
      ${variants ? JSON.stringify(variants) : null}::jsonb,
      ${s.status === 'rejected' ? 'unsafe_content' : null})
  `);
  for (const p of variants ? Object.values(variants) : [objectPath]) {
    await storage.write(s.bucket, p, new Uint8Array([1]), 'application/octet-stream');
  }
  return id;
}

const stranger = (): MediaViewer => ({ userId: newId(), orgIds: [], isOperator: false });

describe('getMediaUrl', () => {
  it('gives a stranger forbidden for a private resume, and the owner a 300-second signed URL', async () => {
    const owner = await newUser();
    const id = await seed({
      kind: 'resume',
      status: 'approved',
      bucket: 'media-private',
      ownerUserId: owner,
      pdf: true,
    });

    await expect(getMediaUrl(t.db, storage, stranger(), id)).rejects.toMatchObject({
      code: 'forbidden',
    });

    const signed = vi.spyOn(storage, 'signedUrl');
    const url = await getMediaUrl(
      t.db,
      storage,
      { userId: owner, orgIds: [], isOperator: false },
      id,
    );
    expect(url).toBe(`memory://media-private/${id}.pdf?expiresIn=300`);
    expect(signed).toHaveBeenCalledWith('media-private', `${id}.pdf`, 300);
  });

  it('lets a member of the owning organization and an operator read private files', async () => {
    const owner = await newUser();
    const org = await newOrg();
    const id = await seed({
      kind: 'attachment',
      status: 'approved',
      bucket: 'media-private',
      ownerUserId: owner,
      ownerOrgId: org,
      pdf: true,
    });
    const member: MediaViewer = { userId: newId(), orgIds: [newId(), org], isOperator: false };
    expect(await getMediaUrl(t.db, storage, member, id)).toContain('expiresIn=300');
    const operator: MediaViewer = { userId: newId(), orgIds: [], isOperator: true };
    expect(await getMediaUrl(t.db, storage, operator, id)).toContain('expiresIn=300');
    const otherOrg: MediaViewer = { userId: newId(), orgIds: [newId()], isOperator: false };
    await expect(getMediaUrl(t.db, storage, otherOrg, id)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('returns the public URL of an approved public image to anyone, per variant', async () => {
    const owner = await newUser();
    const id = await seed({
      kind: 'listing_photo',
      status: 'approved',
      bucket: 'media-public',
      ownerUserId: owner,
    });
    expect(await getMediaUrl(t.db, storage, stranger(), id)).toBe(
      `memory://media-public/${id}/1280.webp`,
    );
    expect(await getMediaUrl(t.db, storage, stranger(), id, 320)).toBe(
      `memory://media-public/${id}/320.webp`,
    );
  });

  it('shows an image held for review only to its owner and operators', async () => {
    const owner = await newUser();
    const id = await seed({
      kind: 'community_photo',
      status: 'in_review',
      bucket: 'media-private',
      ownerUserId: owner,
    });
    await expect(getMediaUrl(t.db, storage, stranger(), id)).rejects.toMatchObject({
      code: 'forbidden',
    });
    const operator: MediaViewer = { userId: newId(), orgIds: [], isOperator: true };
    expect(await getMediaUrl(t.db, storage, operator, id, 640)).toBe(
      `memory://media-private/${id}/640.webp?expiresIn=300`,
    );
  });

  it('shows a rejected file kept for review only to operators', async () => {
    const owner = await newUser();
    const id = await seed({
      kind: 'listing_photo',
      status: 'rejected',
      bucket: 'media-private',
      ownerUserId: owner,
    });
    await expect(
      getMediaUrl(t.db, storage, { userId: owner, orgIds: [], isOperator: false }, id),
    ).rejects.toMatchObject({ code: 'not_found' });
    const operator: MediaViewer = { userId: newId(), orgIds: [], isOperator: true };
    expect(await getMediaUrl(t.db, storage, operator, id)).toBe(
      `memory://media-private/${id}/1280.webp?expiresIn=300`,
    );
  });

  it('never serves a blocked file, not even to an operator', async () => {
    const owner = await newUser();
    const id = await seed({
      kind: 'community_photo',
      status: 'blocked',
      bucket: 'evidence',
      ownerUserId: owner,
      pdf: true,
    });
    const operator: MediaViewer = { userId: newId(), orgIds: [], isOperator: true };
    await expect(getMediaUrl(t.db, storage, operator, id)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('is not_found for files still scanning or rejected, and for unknown ids', async () => {
    const owner = await newUser();
    const viewer: MediaViewer = { userId: owner, orgIds: [], isOperator: false };
    for (const status of ['scanning', 'rejected'] as const) {
      const id = await seed({ kind: 'avatar', status, bucket: 'quarantine', ownerUserId: owner });
      await expect(getMediaUrl(t.db, storage, viewer, id)).rejects.toMatchObject({
        code: 'not_found',
      });
    }
    await expect(getMediaUrl(t.db, storage, viewer, newId())).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(getMediaUrl(t.db, storage, viewer, 'not-a-uuid')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
