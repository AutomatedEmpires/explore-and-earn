// The host gate (legal review section 7): only a verified host passes; the new-host daily cap on
// profile views; and the silent-host alert, one open item per host.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { NEW_HOST_DAILY_CAP } from '@/modules/ratelimit';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg } from '../../../tests/helpers/sp2';
import {
  APPLICANT_DATA_BLOCKED,
  PROFILE_VIEW_CAP_COPY,
  SILENT_HOST_REASON,
  alertSilentHost,
  hostApplicantGate,
  requireProfileView,
} from './host-gate';

const BLOCKED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;

const DAY_MS = 86_400_000;
/** Midday UTC, so a test's views never straddle the limiter's UTC day. */
const NOW = new Date('2026-11-18T12:00:00Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function orgCreated(createdAt: Date): Promise<string> {
  const org = await seedHostOrg(t.db);
  await t.db.execute(
    sql`update app.organizations set created_at = ${createdAt} where id = ${org.orgId}`,
  );
  return org.orgId;
}

async function rejection(p: Promise<unknown>): Promise<{ status: number; message: string; details: unknown }> {
  try {
    await p;
  } catch (err) {
    return err as { status: number; message: string; details: unknown };
  }
  throw new Error('expected a rejection');
}

describe('hostApplicantGate', () => {
  it('allows a verified host', async () => {
    const org = await seedHostOrg(t.db);
    await t.db.execute(
      sql`update app.organizations set verification_status = 'verified' where id = ${org.orgId}`,
    );
    expect(await hostApplicantGate(t.db, org.orgId)).toEqual({ ok: true });
  });

  it.each(BLOCKED)('refuses %s with that reason', async (status) => {
    const org = await seedHostOrg(t.db);
    await t.db.execute(
      sql`update app.organizations set verification_status = ${status} where id = ${org.orgId}`,
    );
    expect(await hostApplicantGate(t.db, org.orgId)).toEqual({ ok: false, reason: status });
  });

  it('lists every status but verified as blocked', () => {
    expect([...APPLICANT_DATA_BLOCKED].sort()).toEqual([...BLOCKED].sort());
  });
});

describe('requireProfileView (the new-host daily cap)', () => {
  it('allows the daily cap of distinct people, then refuses with 429 new_host_daily_cap', async () => {
    const orgId = await orgCreated(new Date(NOW.getTime() - 3 * DAY_MS));
    for (let i = 0; i < NEW_HOST_DAILY_CAP.profile_views; i++) {
      await requireProfileView(t.db, orgId, newId(), NOW);
    }
    const err = await rejection(requireProfileView(t.db, orgId, newId(), NOW));
    expect(err.status).toBe(429);
    expect(err.message).toBe(PROFILE_VIEW_CAP_COPY);
    expect(err.details).toEqual({
      reason: 'new_host_daily_cap',
      resetAt: '2026-11-19T00:00:00.000Z',
    });
  });

  it('never counts a second view of the same person on the same day', async () => {
    const orgId = await orgCreated(new Date(NOW.getTime() - DAY_MS));
    const seen = newId();
    await requireProfileView(t.db, orgId, seen, NOW);
    for (let i = 1; i < NEW_HOST_DAILY_CAP.profile_views; i++) {
      await requireProfileView(t.db, orgId, newId(), NOW);
    }
    // The cap is used up, but a person already viewed today stays viewable.
    await requireProfileView(t.db, orgId, seen, NOW);
    await requireProfileView(t.db, orgId, seen, NOW);
    expect((await rejection(requireProfileView(t.db, orgId, newId(), NOW))).status).toBe(429);
  });

  it('keeps refusing a person it refused: a retry is not a free repeat view', async () => {
    const orgId = await orgCreated(new Date(NOW.getTime() - DAY_MS));
    for (let i = 0; i < NEW_HOST_DAILY_CAP.profile_views; i++) {
      await requireProfileView(t.db, orgId, newId(), NOW);
    }
    const refused = newId();
    expect((await rejection(requireProfileView(t.db, orgId, refused, NOW))).status).toBe(429);
    expect((await rejection(requireProfileView(t.db, orgId, refused, NOW))).status).toBe(429);
  });

  it('starts again the next day', async () => {
    const orgId = await orgCreated(new Date(NOW.getTime() - DAY_MS));
    for (let i = 0; i < NEW_HOST_DAILY_CAP.profile_views; i++) {
      await requireProfileView(t.db, orgId, newId(), NOW);
    }
    await requireProfileView(t.db, orgId, newId(), new Date(NOW.getTime() + DAY_MS));
  });

  it('does not limit a host past its first 30 days, and writes nothing for it', async () => {
    const orgId = await orgCreated(new Date(NOW.getTime() - 30 * DAY_MS));
    for (let i = 0; i < NEW_HOST_DAILY_CAP.profile_views + 5; i++) {
      await requireProfileView(t.db, orgId, newId(), NOW);
    }
    const rows = await queryRows<{ key: string }>(
      t.db,
      sql`select key from app.rate_limits where key like ${`%${orgId}%`}`,
    );
    expect(rows).toEqual([]);
  });

  it('keeps seeker ids out of the limiter table', async () => {
    const orgId = await orgCreated(new Date(NOW.getTime() - DAY_MS));
    const seekerUserId = newId();
    await requireProfileView(t.db, orgId, seekerUserId, NOW);
    const rows = await queryRows<{ key: string }>(
      t.db,
      sql`select key from app.rate_limits where key like ${`%${seekerUserId}%`}`,
    );
    expect(rows).toEqual([]);
  });
});

describe('alertSilentHost', () => {
  const fraudItems = (orgId: string) =>
    queryRows<{ id: string; reason: string; status: string }>(
      t.db,
      sql`select id, reason, status from app.review_items
        where subject_type = 'business_verification' and subject_id = ${orgId}
        order by created_at, id`,
    );

  it('alerts operators when a host opens many applications and never replies', async () => {
    const org = await seedHostOrg(t.db);
    expect(await alertSilentHost(t.db, org.orgId, 9, 0)).toBe(false);
    expect(await alertSilentHost(t.db, org.orgId, 10, 1)).toBe(false);
    expect(await alertSilentHost(t.db, org.orgId, 10, 0)).toBe(true);
    expect((await fraudItems(org.orgId)).map((r) => r.reason)).toEqual([SILENT_HOST_REASON]);
    expect(SILENT_HOST_REASON).toBe('silent_host');
  });

  it('keeps one open item per host however often it is called', async () => {
    const org = await seedHostOrg(t.db);
    expect(await alertSilentHost(t.db, org.orgId, 10, 0)).toBe(true);
    expect(await alertSilentHost(t.db, org.orgId, 11, 0)).toBe(false);
    expect(await alertSilentHost(t.db, org.orgId, 40, 0)).toBe(false);
    await Promise.all([
      alertSilentHost(t.db, org.orgId, 41, 0),
      alertSilentHost(t.db, org.orgId, 42, 0),
    ]);
    expect(await fraudItems(org.orgId)).toEqual([
      expect.objectContaining({ reason: 'silent_host' }),
    ]);
  });

  it('opens a new item only once an operator has resolved the last one', async () => {
    const org = await seedHostOrg(t.db);
    expect(await alertSilentHost(t.db, org.orgId, 10, 0)).toBe(true);
    const [first] = await fraudItems(org.orgId);
    await t.db.execute(
      sql`update app.review_items set status = 'resolved', resolution = 'approve', resolved_at = now()
        where id = ${first?.id ?? ''}`,
    );
    expect(await alertSilentHost(t.db, org.orgId, 12, 0)).toBe(true);
    expect((await fraudItems(org.orgId)).map((r) => r.status === 'resolved')).toEqual([true, false]);
  });
});
