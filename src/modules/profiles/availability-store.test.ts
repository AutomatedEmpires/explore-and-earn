import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { seedUser } from '@tests/helpers/sp4';
import { createTestDb, type TestDb } from '@tests/helpers/db';

vi.mock('@/modules/notifications', async (orig) => {
  const actual = await orig<typeof import('@/modules/notifications')>();
  return { ...actual, notify: vi.fn(async () => undefined) };
});

import { notify } from '@/modules/notifications';
import { confirmAvailability, setAvailability } from './availability-store';
import { AVAILABILITY_SWEEP_TOPIC, coreJobHandlers } from './jobs-core';

let t: TestDb;
const calls = notify as unknown as ReturnType<typeof vi.fn>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function seeker() {
  return seedUser(t.db, { accountType: 'seeker' });
}

describe('availability', () => {
  it('refuses a client date more than a day from the server', async () => {
    const user = await seeker();
    await expect(
      setAvailability(
        t.db,
        user.id,
        { preset: 'now', clientToday: '2026-11-03' },
        new Date('2026-11-05T12:00:00Z'),
      ),
    ).rejects.toMatchObject({ status: 400, details: { reason: 'client_today_skew' } });
  });

  it('stores the client\'s today when the server is already the next UTC day', async () => {
    const user = await seeker();
    const saved = await setAvailability(
      t.db,
      user.id,
      { preset: 'now', clientToday: '2026-12-02' },
      new Date('2026-12-03T06:00:00Z'),
    );
    expect(saved).toMatchObject({ preset: 'now', date: '2026-12-02', confirmedDaysAgo: 0 });
  });

  it('confirming a past date switches the preset to now', async () => {
    const user = await seeker();
    await setAvailability(
      t.db,
      user.id,
      { preset: 'exact', date: '2026-11-01', clientToday: '2026-11-01' },
      new Date('2026-11-01T18:00:00Z'),
    );
    const saved = await confirmAvailability(
      t.db,
      user.id,
      { clientToday: '2026-12-02' },
      new Date('2026-12-02T18:00:00Z'),
    );
    expect(saved).toMatchObject({ preset: 'now', date: '2026-12-02' });
    const rows = await queryRows<{ n: number }>(
      t.db,
      sql`
        select count(*)::int as n from app.audit_events
        where action = 'profiles.availability_set' and subject_id = ${user.id}
      `,
    );
    expect(rows[0]?.n).toBe(2);
  });

  it('reminds at 30 and 60 days and hides at 90, one step at a time', async () => {
    const user = await seeker();
    const confirmed = new Date('2026-01-01T15:00:00Z');
    await t.db.execute(sql`
      insert into app.seeker_profiles (
        user_id, visible_to_hosts, avail_preset, avail_date, avail_confirmed_at, avail_reminders_sent
      ) values (
        ${user.id}, true, 'exact', '2026-01-01', ${confirmed.toISOString()}::timestamptz, 0
      )
    `);
    const day = 24 * 60 * 60 * 1000;
    const at = (days: number) => new Date(confirmed.getTime() + days * day);
    calls.mockClear();
    await coreJobHandlers[AVAILABILITY_SWEEP_TOPIC]?.({}, { db: t.db, now: at(29) });
    expect(calls).not.toHaveBeenCalled();
    await coreJobHandlers[AVAILABILITY_SWEEP_TOPIC]?.({}, { db: t.db, now: at(30) });
    await coreJobHandlers[AVAILABILITY_SWEEP_TOPIC]?.({}, { db: t.db, now: at(30) });
    await coreJobHandlers[AVAILABILITY_SWEEP_TOPIC]?.({}, { db: t.db, now: at(60) });
    await coreJobHandlers[AVAILABILITY_SWEEP_TOPIC]?.({}, { db: t.db, now: at(90) });
    const types = calls.mock.calls.map((call) => call[2]);
    expect(types).toEqual([
      'profiles.availability_reconfirm',
      'profiles.availability_reconfirm',
      'profiles.availability_hidden',
    ]);
    const [row] = await queryRows<{ sent: number }>(
      t.db,
      sql`select avail_reminders_sent as sent from app.seeker_profiles where user_id = ${user.id}`,
    );
    expect(row?.sent).toBe(3);
  });
});
