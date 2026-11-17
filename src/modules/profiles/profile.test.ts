import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { profileSnapshotV1Schema } from '@/lib/profiles';
import { seedUser } from '@tests/helpers/sp4';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import {
  buildProfileSnapshot,
  getCommunityIdentities,
  getOwnProfile,
  getPreferenceTargets,
  needsAttention,
  updateProfile,
} from './profile';
import { setSkills } from './entries';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function auditData(userId: string, action: string): Promise<unknown[]> {
  const rows = await queryRows<{ data: unknown }>(
    t.db,
    sql`select data from app.audit_events where action = ${action} and subject_id = ${userId}`,
  );
  return rows.map((row) => row.data);
}

async function seedMedia(ownerUserId: string, kind: 'avatar' | 'cover'): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.media (id, owner_user_id, kind, status, bucket, path, declared_mime, size_bytes)
    values (${id}, ${ownerUserId}, ${kind}, 'approved', 'media-public', ${`${id}/${kind}.webp`},
      'image/webp', 1000)
  `);
  return id;
}

describe('own profile', () => {
  it('returns defaults before the first write', async () => {
    const user = await seedUser(t.db, { accountType: 'seeker' });
    const view = await getOwnProfile(t.db, user.id);
    expect(view.visibility).toEqual({ visibleToHosts: true, showPhotoToHosts: false });
    expect(view.resume).toEqual({ mode: 'classic' });
    expect(view.missingItem).toBe('name');
    expect(view.poolEligible).toBe(false);
    expect(view.version).toBe(0);
    expect(await needsAttention(t.db, user.id)).toBe(false);
  });

  it('audits a name and city change with sorted field names and no values', async () => {
    const user = await seedUser(t.db, { accountType: 'seeker' });
    const view = await updateProfile(t.db, user.id, {
      identity: { firstName: 'Maya', city: 'Juneau' },
    });
    expect(view.version).toBe(1);
    expect(view.identity.firstName).toBe('Maya');
    expect(view.missingItem).toBe('availability');
    const rows = await auditData(user.id, 'profiles.updated');
    expect(rows).toEqual([{ fields: ['city', 'firstName'] }]);
    expect(JSON.stringify(rows)).not.toContain('Maya');
  });

  it('hides the missing item when hosts cannot see the profile', async () => {
    const user = await seedUser(t.db, { accountType: 'seeker' });
    const view = await updateProfile(t.db, user.id, { visibility: { visibleToHosts: false } });
    expect(view.missingItem).toBeNull();
    expect(view.poolEligible).toBe(false);
    expect(await auditData(user.id, 'profiles.visibility_changed')).toEqual([
      { fields: ['visibleToHosts'] },
    ]);
    expect(await auditData(user.id, 'profiles.updated')).toEqual([]);
  });

  it('saves a Canadian region and refuses Ontario once the country is the US', async () => {
    const user = await seedUser(t.db, { accountType: 'seeker' });
    const saved = await updateProfile(t.db, user.id, {
      identity: { countryCode: 'CA', region: 'Ontario' },
    });
    expect(saved.identity.region).toBe('Ontario');
    expect(saved.identity.countryCode.trim()).toBe('CA');
    await expect(
      updateProfile(t.db, user.id, { identity: { countryCode: 'US' } }),
    ).rejects.toMatchObject({ status: 400, details: { reason: 'region' } });
  });

  it('refuses another person\'s avatar', async () => {
    const owner = await seedUser(t.db, { accountType: 'seeker' });
    const other = await seedUser(t.db, { accountType: 'seeker' });
    const avatar = await seedMedia(other.id, 'avatar');
    await expect(
      updateProfile(t.db, owner.id, { identity: { avatarMediaId: avatar } }),
    ).rejects.toMatchObject({ status: 400, details: { reason: 'invalid_media' } });
  });

  it('builds a snapshot, community name and preference targets', async () => {
    const user = await seedUser(t.db, { accountType: 'seeker' });
    const avatar = await seedMedia(user.id, 'avatar');
    await updateProfile(t.db, user.id, {
      identity: {
        firstName: 'Maya',
        lastName: 'Rodriguez',
        city: 'Juneau',
        region: 'AK',
        avatarMediaId: avatar,
      },
      preferences: { categories: ['maritime'], states: ['AK'] },
      workAuthorization: { status: 'authorized' },
      visibility: { showPhotoToHosts: false },
    });
    await setSkills(t.db, user.id, [
      { label: 'Cooking', highlighted: false },
      { label: 'Deckhand', highlighted: true },
    ]);

    const hidden = await buildProfileSnapshot(t.db, user.id, { includeWorkAuthorization: false });
    expect(hidden.workAuthorization).toBeNull();
    expect(hidden.avatarMediaId).toBeNull();
    expect(hidden.email).toBe(user.email);
    expect(hidden.skills.map((skill) => skill.label)).toEqual(['Deckhand', 'Cooking']);
    expect(profileSnapshotV1Schema.safeParse(hidden).success).toBe(true);

    const shown = await buildProfileSnapshot(t.db, user.id, { includeWorkAuthorization: true });
    expect(shown.workAuthorization).toEqual({ status: 'authorized' });

    const identities = await getCommunityIdentities(t.db, [user.id]);
    expect(identities.get(user.id)).toEqual({
      displayName: 'Maya Rodriguez',
      firstName: 'Maya',
      lastInitial: 'R',
      avatarMediaId: avatar,
    });

    expect(await getPreferenceTargets(t.db, user.id)).toEqual({
      categories: ['maritime'],
      states: ['AK'],
    });
    expect(await needsAttention(t.db, user.id)).toBe(true);
  });

  it('asks for attention while a visible profile is missing a city', async () => {
    const user = await seedUser(t.db, { accountType: 'seeker' });
    await updateProfile(t.db, user.id, { identity: { firstName: 'Maya' } });
    expect(await needsAttention(t.db, user.id)).toBe(true);
  });
});
