import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedSeeker } from '@tests/helpers/sp8';
import { privacyHandler } from './privacy';
import { clerkIdHash, isErasedClerkUser } from './sync';

const NOW = new Date('2026-11-18T12:00:00Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const erase = (s: PrivacySubject, holds: HoldScope[] = []) =>
  withTx(t.db, (tx) => privacyHandler.erase(tx, s, { requestId: newId(), now: NOW, holds }));

async function row(userId: string) {
  const [found] = await queryRows<{
    clerk_user_id: string;
    email: string | null;
    display_name: string | null;
    deleted_at: Date | string | null;
    erased_clerk_id_sha256: string | null;
  }>(
    t.db,
    sql`select clerk_user_id, email, display_name, deleted_at, erased_clerk_id_sha256
        from app.users where id = ${userId}`,
  );
  if (!found) throw new Error('user not found');
  return found;
}

describe('identity privacy handler', () => {
  it('exports the account and nothing about anyone else', async () => {
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    const part = await privacyHandler.exportData(t.db, { kind: 'user', userId: seeker.userId });
    expect(part.files).toEqual([]);
    expect(part.records.account).toEqual([
      expect.objectContaining({
        id: seeker.userId,
        email: seeker.user.email,
        displayName: 'Maya',
        accountType: 'seeker',
      }),
    ]);
    expect(JSON.stringify(part)).not.toContain(other.user.email);
    expect(Object.keys(part.records.account?.[0] as object).sort()).toEqual([
      'accountType',
      'adultAttestedAt',
      'createdAt',
      'displayName',
      'email',
      'id',
    ]);
  });

  it('pseudonymizes the row, tombstones the Clerk id, and is idempotent', async () => {
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    const before = await row(other.userId);
    const subject = { kind: 'user' as const, userId: seeker.userId };

    const first = await erase(subject);
    expect(first).toEqual({
      erased: 1,
      retained: [{ table: 'users', reason: 'shared_record', until: null }],
    });
    const after = await row(seeker.userId);
    expect(after).toMatchObject({
      clerk_user_id: `deleted:${seeker.userId}`,
      email: null,
      display_name: 'Deleted user',
      erased_clerk_id_sha256: clerkIdHash(seeker.user.clerkUserId),
    });
    expect(new Date(after.deleted_at ?? 0)).toEqual(NOW);
    expect(await isErasedClerkUser(t.db, seeker.user.clerkUserId)).toBe(true);

    const second = await erase(subject);
    expect(second).toEqual({ erased: 0, retained: first.retained });
    // The tombstone is still the hash of the real id, never of `deleted:<id>`.
    expect((await row(seeker.userId)).erased_clerk_id_sha256).toBe(
      clerkIdHash(seeker.user.clerkUserId),
    );
    expect(await row(other.userId)).toEqual(before);
    expect(await isErasedClerkUser(t.db, other.user.clerkUserId)).toBe(false);
  });

  it('keeps the record under a hold on everything, but still tombstones it', async () => {
    const seeker = await seedSeeker(t.db);
    const subject = { kind: 'user' as const, userId: seeker.userId };

    const held = await erase(subject, ['all']);
    expect(held).toEqual({
      erased: 0,
      retained: [{ table: 'users', reason: 'legal_hold', until: null }],
    });
    const kept = await row(seeker.userId);
    expect(kept).toMatchObject({
      clerk_user_id: seeker.user.clerkUserId,
      email: seeker.user.email,
      display_name: 'Maya',
      erased_clerk_id_sha256: clerkIdHash(seeker.user.clerkUserId),
    });
    expect(kept.deleted_at).not.toBeNull();
    expect(await erase(subject, ['all'])).toEqual(held);

    // Once the hold is released the same eraser finishes the job.
    expect((await erase(subject)).erased).toBe(1);
    expect(await row(seeker.userId)).toMatchObject({
      clerk_user_id: `deleted:${seeker.userId}`,
      email: null,
      erased_clerk_id_sha256: clerkIdHash(seeker.user.clerkUserId),
    });
  });

  it('holds a narrower scope without keeping the identity', async () => {
    const seeker = await seedSeeker(t.db);
    const result = await erase({ kind: 'user', userId: seeker.userId }, ['reports']);
    expect(result.erased).toBe(1);
    expect((await row(seeker.userId)).email).toBeNull();
  });

  it('does nothing for an organization or an unknown person', async () => {
    const org = await seedHostOrg(t.db);
    expect(await erase({ kind: 'org', orgId: org.orgId })).toEqual({ erased: 0, retained: [] });
    expect((await row(org.owner.userId)).email).toBe(org.owner.email);
    expect(await erase({ kind: 'user', userId: newId() })).toEqual({ erased: 0, retained: [] });
    expect(
      await privacyHandler.exportData(t.db, { kind: 'org', orgId: org.orgId }),
    ).toEqual({ records: { account: [] }, files: [] });
  });
});
