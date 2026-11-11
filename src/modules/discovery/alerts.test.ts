// Saved-search matching and the alert push (SP3 spec 8.10, plan Task 29), and the daily and
// weekly emails (Task 30): the (watermark, now − 2 min] window, the creation-time rule, the
// exclusions, 50 matches per search per run, chunks of 500 searches that never split a user,
// one push per user per run under the daily cap, idempotent retries, and emails that carry only
// still-active jobs (spec failure modes 1 and 5).
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { seedSeeker } from '../../../tests/helpers/sp2';
import { queryRows } from '@/lib/db';
import type { DiscoveryQuery } from '@/lib/discovery';
import { newId } from '@/lib/ids';
import { setPreference } from '@/modules/notifications';
import type { ProjectionRowInput } from './projection-columns';
import { alertHandlers, runAlertEmails } from './alerts';
import { registerSeekerOverlay, resetSeekerOverlayForTests } from './hooks';
import { createSavedSearch } from './saved-searches';

const MIN = 60_000;
const DAY = 86_400_000;
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000);
/** The watermark most tests start from. */
const T = new Date(NOW.getTime() - 10 * MIN);
const APP_URL = 'http://localhost:3000';

let t: TestDb;
let userId: string;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`truncate app.saved_search_matches, app.saved_searches, app.alert_settings,
    app.discovery_sync_state, app.discovery_listings, app.listing_dispositions, app.notifications,
    app.notification_preferences, app.push_subscriptions, app.outbox, app.settings`);
  userId = await seeker();
});

afterEach(() => {
  resetSeekerOverlayForTests();
});

// --- Helpers ---------------------------------------------------------------------------------

/** A seeker with one push subscription, so a push reaches the outbox. */
async function seeker(): Promise<string> {
  const id = (await seedSeeker(t.db)).userId;
  await t.db.execute(sql`
    insert into app.push_subscriptions (id, user_id, endpoint, p256dh, auth)
    values (${newId()}, ${id}, ${`https://fcm.googleapis.com/fcm/send/${newId()}`}, 'p', 'a')
  `);
  return id;
}

/** A saved search created an hour ago, so every listing in the window is newer. */
async function search(
  user: string,
  query: DiscoveryQuery,
  o: { createdAt?: Date; pushEnabled?: boolean; emailDaily?: boolean } = {},
): Promise<string> {
  const { item } = await createSavedSearch(t.db, user, { query });
  await t.db.execute(sql`update app.saved_searches set
      created_at = ${(o.createdAt ?? new Date(NOW.getTime() - 60 * MIN)).toISOString()}::timestamptz,
      push_enabled = ${o.pushEnabled ?? true}, email_daily = ${o.emailDaily ?? true}
    where id = ${item.id}::uuid`);
  return item.id;
}

const setWatermark = (at: Date) =>
  t.db.execute(sql`insert into app.discovery_sync_state (key, watermark)
    values ('alerts_match', ${at.toISOString()}::timestamptz)
    on conflict (key) do update set watermark = excluded.watermark`);

async function watermark(): Promise<number | null> {
  const [row] = await queryRows<{ ms: number }>(
    t.db,
    sql`select (extract(epoch from watermark) * 1000)::float8 as ms from app.discovery_sync_state
      where key = 'alerts_match'`,
  );
  return row ? Number(row.ms) : null;
}

/** Listings first active at the given times (default: five minutes into the window). */
const listings = (rows: Partial<ProjectionRowInput>[]) =>
  insertProjectionRows(
    t.db,
    rows.map((r) => ({ firstActiveAt: new Date(T.getTime() + 5 * MIN), ...r })),
    NOW,
  );

const match = (payload: unknown = { scheduledFor: NOW.toISOString() }, now = NOW) =>
  alertHandlers['discovery.alerts_match']?.(payload, { db: t.db, now });

async function matchesOf(searchId: string) {
  return queryRows<{ listingId: string; pushed: boolean }>(
    t.db,
    sql`select listing_id::text as "listingId", pushed_at is not null as pushed
      from app.saved_search_matches where saved_search_id = ${searchId}::uuid
      order by listing_id`,
  );
}

async function notificationsOf(user: string, type: string) {
  return queryRows<{ title: string; body: string; data: string }>(
    t.db,
    sql`select title, body, data::text as data from app.notifications
      where user_id = ${user}::uuid and type = ${type} order by id`,
  );
}

async function outboxCount(topic: string): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    t.db,
    sql`select count(*)::int as n from app.outbox where topic = ${topic}`,
  );
  return Number(row?.n ?? 0);
}

// --- Matching --------------------------------------------------------------------------------

describe('discovery.alerts_match: the window', () => {
  it('starts the watermark at now − 2 min and matches nothing on its first run', async () => {
    const s = await search(userId, {});
    await listings([{}]);
    await match();
    expect(await watermark()).toBe(NOW.getTime() - 2 * MIN);
    expect(await matchesOf(s)).toEqual([]);
  });

  it('matches listings first active after the watermark, up to now − 2 min', async () => {
    await setWatermark(T);
    const s = await search(userId, {});
    const [atT, justAfter, tooRecent] = await listings([
      { firstActiveAt: T },
      { firstActiveAt: new Date(T.getTime() + 1000) },
      { firstActiveAt: new Date(NOW.getTime() - MIN) },
    ]);
    await match();
    expect((await matchesOf(s)).map((m) => m.listingId)).toEqual([justAfter]);
    expect(await watermark()).toBe(NOW.getTime() - 2 * MIN);

    // The next run, 15 minutes later, picks up the one that was too recent.
    await match(undefined, new Date(NOW.getTime() + 15 * MIN));
    expect((await matchesOf(s)).map((m) => m.listingId).sort()).toEqual(
      [justAfter, tooRecent].sort(),
    );
    expect((await matchesOf(s)).map((m) => m.listingId)).not.toContain(atT);
  });

  it('never matches a listing first active before the search was created', async () => {
    await setWatermark(T);
    const s = await search(userId, {}, { createdAt: new Date(T.getTime() + 30_000) });
    const [, after] = await listings([
      { firstActiveAt: new Date(T.getTime() + 10_000) },
      { firstActiveAt: new Date(T.getTime() + 60_000) },
    ]);
    await match();
    expect((await matchesOf(s)).map((m) => m.listingId)).toEqual([after]);
  });

  it('matches only through the search filters, on active listings', async () => {
    await setWatermark(T);
    const s = await search(userId, { categories: ['farm'] });
    const [farm] = await listings([
      { category: 'farm', genre: 'harvest' },
      {},
      { category: 'farm', genre: 'harvest', isActive: false, closedAt: NOW },
    ]);
    await match();
    expect((await matchesOf(s)).map((m) => m.listingId)).toEqual([farm]);
  });

  it('leaves out skipped listings, listings the seeker applied to and hidden hosts', async () => {
    await setWatermark(T);
    const blockedOrg = newId();
    const [plain, skipped, applied] = await listings([{}, {}, {}, { orgId: blockedOrg }]);
    await t.db.execute(sql`insert into app.listing_dispositions
        (user_id, listing_id, state, source, acted_at)
      values (${userId}::uuid, ${skipped}::uuid, 'skipped', 'swipe', now())`);
    registerSeekerOverlay({
      appliedListingIds: async (_db, _u, list) =>
        new Set(list === 'all' ? [applied as string] : list.filter((x) => x === applied)),
      hiddenOrgIds: async () => [blockedOrg],
    });
    const s = await search(userId, {});
    await match();
    expect((await matchesOf(s)).map((m) => m.listingId)).toEqual([plain]);
  });

  it('keeps at most 50 matches per search per run', async () => {
    await setWatermark(T);
    const s = await search(userId, {}, { pushEnabled: false });
    await listings(
      Array.from({ length: 60 }, (_, n) => ({
        firstActiveAt: new Date(T.getTime() + (n + 1) * 1000),
      })),
    );
    await match();
    expect(await matchesOf(s)).toHaveLength(50);
  });
});

describe('discovery.alerts_match: chunks', () => {
  it('matches 500 searches a chunk without splitting a user, then moves the watermark', async () => {
    await setWatermark(T);
    await t.db.execute(sql`truncate app.saved_searches, app.push_subscriptions, app.users cascade`);
    await listings([{}]);

    // 600 users with 1,200 searches, pushes off. The first user has 2, then 3 and 1 alternate,
    // and the last has 2, so the 500th search is the middle one of user 250's three.
    const users = Array.from({ length: 600 }, () => newId()).sort();
    const counts = users.map((_, n) => (n === 0 || n === 599 ? 2 : n % 2 === 1 ? 3 : 1));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1200);
    await t.db
      .execute(sql`insert into app.users (id, clerk_user_id, email, account_type, adult_attested_at)
      values ${sql.join(
        users.map(
          (id) => sql`(${id}::uuid, ${`user_${id}`}, ${`${id}@example.test`}, 'seeker', now())`,
        ),
        sql`, `,
      )}`);
    const created = new Date(NOW.getTime() - 60 * MIN).toISOString();
    const rows = users.flatMap((id, n) =>
      Array.from(
        { length: counts[n] ?? 0 },
        (_, k) =>
          sql`(${newId()}::uuid, ${id}::uuid, 'Everything', '{}'::jsonb, ${`hash-${k}`}, false,
          ${created}::timestamptz)`,
      ),
    );
    await t.db.execute(sql`insert into app.saved_searches
        (id, user_id, name, query, query_hash, push_enabled, created_at)
      values ${sql.join(rows, sql`, `)}`);

    type Chunk = { windowStart: string; windowEnd: string; afterUserId: string };
    /** The follow-up chunk the last run enqueued, checked against its dedupe key. */
    const latestChunk = async (): Promise<Chunk> => {
      const [next] = await queryRows<{ payload: string; dedupe: string }>(
        t.db,
        sql`select payload::text as payload, dedupe_key as dedupe from app.outbox
          where topic = 'discovery.alerts_match' order by id desc limit 1`,
      );
      const payload = JSON.parse(next?.payload ?? '{}') as Chunk;
      expect(next?.dedupe).toBe(`alerts_match:${payload.windowEnd}:${payload.afterUserId}`);
      return payload;
    };
    const matchedUsers = async () =>
      (
        await queryRows<{ id: string; n: number }>(
          t.db,
          sql`select s.user_id::text as id, count(*)::int as n from app.saved_search_matches m
            join app.saved_searches s on s.id = m.saved_search_id group by s.user_id`,
        )
      ).sort((a, b) => a.id.localeCompare(b.id));
    const windowEnd = new Date(NOW.getTime() - 2 * MIN).toISOString();

    // Chunk 1: searches 1–500 end inside user 250's three, so it takes all of user 250's.
    await match();
    const second = await latestChunk();
    expect(second).toEqual({ windowStart: T.toISOString(), windowEnd, afterUserId: users[249] });
    const first = await matchedUsers();
    expect(first.map((r) => r.id)).toEqual(users.slice(0, 250));
    expect(first.map((r) => r.n)).toEqual(counts.slice(0, 250));
    // The watermark waits for the last chunk.
    expect(await watermark()).toBe(T.getTime());

    // Chunk 2, later in the same window: the next 500 searches, users 251–500.
    await match(second, new Date(NOW.getTime() + MIN));
    const third = await latestChunk();
    expect(third).toEqual({ windowStart: T.toISOString(), windowEnd, afterUserId: users[499] });
    expect((await matchedUsers()).map((r) => r.id)).toEqual(users.slice(0, 500));
    expect(await watermark()).toBe(T.getTime());

    // Chunk 3 has the last 199 searches and closes the window.
    await match(third, new Date(NOW.getTime() + 2 * MIN));
    const all = await matchedUsers();
    expect(all.map((r) => r.id)).toEqual(users);
    expect(all.map((r) => r.n)).toEqual(counts);
    expect(await watermark()).toBe(NOW.getTime() - 2 * MIN);
    expect(await outboxCount('discovery.alerts_match')).toBe(2);
  }, 120_000);
});

// --- Push ------------------------------------------------------------------------------------

describe('discovery.alerts_match: the push', () => {
  it('sends one push per user per run across several searches', async () => {
    await setWatermark(T);
    await search(userId, { categories: ['seasonal'] });
    await search(userId, { categories: ['farm'] });
    await search(userId, { categories: ['maritime'] });
    await listings([
      {},
      {},
      { category: 'farm', genre: 'harvest' },
      { category: 'farm', genre: 'harvest' },
      { category: 'maritime', genre: 'commercial-fishing' },
    ]);
    await match();
    const sent = await notificationsOf(userId, 'discovery.alert_match');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.title).toBe('5 new jobs for your alerts');
    expect(sent[0]?.body).toBe('Open Explore&Earn to see them.');
    expect(JSON.parse(sent[0]?.data ?? '{}')).toMatchObject({ count: 5, url: '/profile/alerts' });
    expect(await outboxCount('notifications.push')).toBe(1);
  });

  it('names the search and opens its newest jobs when one search matched', async () => {
    await setWatermark(T);
    const s = await search(userId, { genres: ['ski-resorts'], states: ['CO'] });
    await listings([{}, {}, {}]);
    await match();
    const [sent] = await notificationsOf(userId, 'discovery.alert_match');
    expect(sent?.title).toBe('3 new jobs for Ski resorts · CO');
    expect(JSON.parse(sent?.data ?? '{}')).toMatchObject({
      count: 3,
      url: '/?genre=ski-resorts&state=CO&sort=newest',
    });
    expect((await matchesOf(s)).every((m) => m.pushed)).toBe(true);
    const [settings] = await queryRows<{ day: string; n: number }>(
      t.db,
      sql`select push_day::text as day, push_count as n from app.alert_settings
        where user_id = ${userId}::uuid`,
    );
    expect(settings).toEqual({ day: NOW.toISOString().slice(0, 10), n: 1 });
  });

  it('reads "1 new job" for a single listing', async () => {
    await setWatermark(T);
    await search(userId, { states: ['CO'] });
    await listings([{}]);
    await match();
    expect((await notificationsOf(userId, 'discovery.alert_match'))[0]?.title).toBe(
      '1 new job for CO',
    );
  });

  it('sends none past the daily cap, leaving the matches for the daily email', async () => {
    await setWatermark(T);
    const s = await search(userId, {});
    await t.db.execute(sql`insert into app.alert_settings (user_id, push_day, push_count)
      values (${userId}::uuid, ${NOW.toISOString().slice(0, 10)}::date, 5)`);
    await listings([{}]);
    await match();
    expect(await notificationsOf(userId, 'discovery.alert_match')).toEqual([]);
    expect(await matchesOf(s)).toEqual([expect.objectContaining({ pushed: false })]);
  });

  it('counts the cap per UTC day', async () => {
    await setWatermark(T);
    await search(userId, {});
    const yesterday = new Date(NOW.getTime() - DAY).toISOString().slice(0, 10);
    await t.db.execute(sql`insert into app.alert_settings (user_id, push_day, push_count)
      values (${userId}::uuid, ${yesterday}::date, 5)`);
    await listings([{}]);
    await match();
    expect(await notificationsOf(userId, 'discovery.alert_match')).toHaveLength(1);
    const [settings] = await queryRows<{ day: string; n: number }>(
      t.db,
      sql`select push_day::text as day, push_count as n from app.alert_settings
        where user_id = ${userId}::uuid`,
    );
    expect(settings).toEqual({ day: NOW.toISOString().slice(0, 10), n: 1 });
  });

  it('follows the cap setting', async () => {
    await setWatermark(T);
    await t.db.execute(
      sql`insert into app.settings (key, value) values ('discovery.alert_push_daily_cap', '0'::jsonb)`,
    );
    await search(userId, {});
    await listings([{}]);
    await match();
    expect(await notificationsOf(userId, 'discovery.alert_match')).toEqual([]);
  });

  it('creates no duplicate match and no second push when a chunk runs again', async () => {
    await setWatermark(T);
    const s = await search(userId, {});
    await listings([{}, {}]);
    const chunk = {
      windowStart: T.toISOString(),
      windowEnd: new Date(NOW.getTime() - 2 * MIN).toISOString(),
    };
    await match(chunk);
    await match(chunk);
    expect(await matchesOf(s)).toHaveLength(2);
    expect(await notificationsOf(userId, 'discovery.alert_match')).toHaveLength(1);
    expect(await outboxCount('notifications.push')).toBe(1);
  });

  it('stores the matches of a search with push off and sends nothing', async () => {
    await setWatermark(T);
    const s = await search(userId, {}, { pushEnabled: false });
    await listings([{}]);
    await match();
    expect(await matchesOf(s)).toEqual([expect.objectContaining({ pushed: false })]);
    expect(await notificationsOf(userId, 'discovery.alert_match')).toEqual([]);
  });

  it('enqueues no push when the seeker turned the alerts category off', async () => {
    await setWatermark(T);
    await setPreference(t.db, userId, 'alerts', 'push', false);
    await setPreference(t.db, userId, 'alerts', 'email', false);
    await search(userId, {});
    await listings([{}]);
    await match();
    expect(await outboxCount('notifications.push')).toBe(0);
  });

  it('pushes each user separately', async () => {
    await setWatermark(T);
    const other = await seeker();
    await search(userId, { categories: ['seasonal'] });
    await search(other, { categories: ['seasonal'] });
    await listings([{}]);
    await match();
    expect(await notificationsOf(userId, 'discovery.alert_match')).toHaveLength(1);
    expect(await notificationsOf(other, 'discovery.alert_match')).toHaveLength(1);
  });

  it('rejects a malformed chunk, so it is retried and seen', async () => {
    await expect(match({ windowStart: 'yesterday', windowEnd: 'today' })).rejects.toThrow();
  });
});

// --- Daily and weekly emails -----------------------------------------------------------------

/** Matches of `searchId` on new listings, newest first by `matchedAt`. */
async function matched(
  searchId: string,
  rows: (Partial<ProjectionRowInput> & { matchedAt?: Date })[],
): Promise<string[]> {
  const ids = await insertProjectionRows(
    t.db,
    rows.map(({ matchedAt: _m, ...r }) => r),
    NOW,
  );
  for (const [n, id] of ids.entries()) {
    const at = rows[n]?.matchedAt ?? new Date(NOW.getTime() - (n + 1) * MIN);
    await t.db.execute(sql`insert into app.saved_search_matches
        (saved_search_id, listing_id, matched_at)
      values (${searchId}::uuid, ${id}::uuid, ${at.toISOString()}::timestamptz)`);
  }
  return ids;
}

type EmailData = {
  count: number;
  searches: {
    name: string;
    url: string;
    items: {
      title: string;
      host: string;
      location: string;
      pay: string;
      housing: string;
      meals: string;
      href: string;
    }[];
  }[];
};

const daily = (payload: unknown = { scheduledFor: NOW.toISOString() }) =>
  alertHandlers['discovery.alerts_daily']?.(payload, { db: t.db, now: NOW });
const weekly = (payload: unknown = { scheduledFor: NOW.toISOString() }) =>
  alertHandlers['discovery.alerts_weekly']?.(payload, { db: t.db, now: NOW });

async function stamped(column: 'daily_emailed_at' | 'weekly_emailed_at'): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    t.db,
    sql`select count(*)::int as n from app.saved_search_matches where ${sql.raw(column)} is not null`,
  );
  return Number(row?.n ?? 0);
}

describe('discovery.alerts_daily', () => {
  it('emails up to 10 still-active matches per search and stamps every match it considered', async () => {
    const s = await search(userId, { genres: ['ski-resorts'], states: ['CO'] });
    const ids = await matched(s, [
      ...Array.from({ length: 12 }, (_, n) => ({ title: `Lift operator ${n + 1}` })),
      { title: 'Night auditor', isActive: false, closedAt: NOW, matchedAt: NOW },
    ]);
    await daily();
    const sent = await notificationsOf(userId, 'discovery.alert_daily');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.title).toBe('New jobs for your alerts');
    expect(sent[0]?.body).toBe('12 new jobs across your saved searches.');
    const data = JSON.parse(sent[0]?.data ?? '{}') as EmailData;
    expect(data.searches).toHaveLength(1);
    const [only] = data.searches;
    expect(only?.name).toBe('Ski resorts · CO');
    expect(only?.url).toBe(`${APP_URL}/?genre=ski-resorts&state=CO&sort=newest`);
    expect(only?.items.map((i) => i.title)).toEqual(
      Array.from({ length: 10 }, (_, n) => `Lift operator ${n + 1}`),
    );
    expect(only?.items[0]).toEqual({
      title: 'Lift operator 1',
      host: 'Kettle Ridge Lodge',
      location: expect.any(String) as string,
      pay: '$19/hr',
      housing: 'Housing provided · $150/week · deducted from pay',
      meals: 'No meals',
      href: `${APP_URL}/jobs/view/${ids[0]}/lift-operator-1?source=other`,
    });
    expect(await stamped('daily_emailed_at')).toBe(13);
    expect(await outboxCount('notifications.email')).toBe(1);

    // Everything was stamped, so the next day's run has nothing to send.
    await daily();
    expect(await notificationsOf(userId, 'discovery.alert_daily')).toHaveLength(1);
  });

  it('sends nothing when the only match has closed, and stamps it', async () => {
    const s = await search(userId, {});
    await matched(s, [{ isActive: false, closedAt: NOW }]);
    await daily();
    expect(await notificationsOf(userId, 'discovery.alert_daily')).toEqual([]);
    expect(await stamped('daily_emailed_at')).toBe(1);
  });

  it('leaves out a search with the daily email off', async () => {
    const on = await search(userId, { categories: ['seasonal'] });
    const off = await search(userId, { categories: ['farm'] }, { emailDaily: false });
    await matched(on, [{}]);
    await matched(off, [{ category: 'farm', genre: 'harvest' }]);
    await daily();
    const [sent] = await notificationsOf(userId, 'discovery.alert_daily');
    const data = JSON.parse(sent?.data ?? '{}') as EmailData;
    expect(data.searches.map((x) => x.name)).toEqual(['Seasonal']);
    expect(await stamped('daily_emailed_at')).toBe(1);
  });

  it('leaves out listings the seeker skipped since they matched', async () => {
    const s = await search(userId, {});
    const [skipped] = await matched(s, [{}]);
    await t.db.execute(sql`insert into app.listing_dispositions
        (user_id, listing_id, state, source, acted_at)
      values (${userId}::uuid, ${skipped}::uuid, 'skipped', 'swipe', now())`);
    await daily();
    expect(await notificationsOf(userId, 'discovery.alert_daily')).toEqual([]);
  });

  it('enqueues no email when the seeker turned alert emails off', async () => {
    await setPreference(t.db, userId, 'alerts', 'email', false);
    const s = await search(userId, {});
    await matched(s, [{}]);
    await daily();
    expect(await outboxCount('notifications.email')).toBe(0);
  });

  it('works through users in chunks, re-enqueuing itself for the rest', async () => {
    const users = [userId, await seeker(), await seeker()].sort();
    for (const u of users) await matched(await search(u, {}), [{}]);
    await runAlertEmails(t.db, 'daily', { scheduledFor: NOW.toISOString() }, NOW, 2);
    const [next] = await queryRows<{ payload: string; dedupe: string }>(
      t.db,
      sql`select payload::text as payload, dedupe_key as dedupe from app.outbox
        where topic = 'discovery.alerts_daily'`,
    );
    const payload = JSON.parse(next?.payload ?? '{}') as { runAt: string; afterUserId: string };
    expect(payload).toEqual({ runAt: NOW.toISOString(), afterUserId: users[1] });
    expect(next?.dedupe).toBe(`alerts_daily:${NOW.toISOString()}:${users[1]}`);
    const sentTo = async () =>
      (
        await queryRows<{ id: string }>(
          t.db,
          sql`select user_id::text as id from app.notifications where type = 'discovery.alert_daily'`,
        )
      )
        .map((r) => r.id)
        .sort();
    expect(await sentTo()).toEqual(users.slice(0, 2));
    await runAlertEmails(t.db, 'daily', payload, NOW, 2);
    expect(await sentTo()).toEqual(users);
    expect(await outboxCount('discovery.alerts_daily')).toBe(1);
  });
});

describe('discovery.alerts_weekly', () => {
  it('sends opted-in seekers the 10 newest active matches of the past 7 days', async () => {
    const other = await seeker();
    await t.db.execute(sql`insert into app.alert_settings (user_id, weekly_digest)
      values (${userId}::uuid, true), (${other}::uuid, false)`);
    const a = await search(userId, { categories: ['seasonal'] });
    const b = await search(userId, { states: ['CO'] });
    const recent = await matched(
      a,
      Array.from({ length: 11 }, (_, n) => ({
        title: `Recent ${n + 1}`,
        matchedAt: new Date(NOW.getTime() - (n + 1) * 3_600_000),
      })),
    );
    await matched(b, [
      { title: 'Too old', matchedAt: new Date(NOW.getTime() - 8 * DAY) },
      { title: 'Closed', isActive: false, closedAt: NOW, matchedAt: NOW },
    ]);
    // The same listing matched by both searches is listed once.
    await t.db
      .execute(sql`insert into app.saved_search_matches (saved_search_id, listing_id, matched_at)
      values (${b}::uuid, ${recent[0]}::uuid, ${NOW.toISOString()}::timestamptz)`);
    await matched(await search(other, {}), [{}]);

    await weekly();
    const sent = await notificationsOf(userId, 'discovery.alert_weekly');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.title).toBe('Your weekly job digest');
    expect(sent[0]?.body).toBe('11 new jobs this week.');
    const data = JSON.parse(sent[0]?.data ?? '{}') as EmailData;
    expect(data.searches.map((x) => [x.name, x.url])).toEqual([
      ['Your saved searches', `${APP_URL}/profile/alerts`],
    ]);
    expect(data.searches[0]?.items.map((i) => i.title)).toEqual(
      Array.from({ length: 10 }, (_, n) => `Recent ${n + 1}`),
    );
    expect(await notificationsOf(other, 'discovery.alert_weekly')).toEqual([]);

    // A rerun sends nothing new.
    await weekly();
    expect(await notificationsOf(userId, 'discovery.alert_weekly')).toHaveLength(1);
  });

  it('sends nothing to an opted-in seeker with no active match this week', async () => {
    await t.db.execute(sql`insert into app.alert_settings (user_id, weekly_digest)
      values (${userId}::uuid, true)`);
    const s = await search(userId, {});
    await matched(s, [{ matchedAt: new Date(NOW.getTime() - 8 * DAY) }]);
    await weekly();
    expect(await notificationsOf(userId, 'discovery.alert_weekly')).toEqual([]);
  });

  it('enqueues no email when the seeker turned alert emails off', async () => {
    await setPreference(t.db, userId, 'alerts', 'email', false);
    await t.db.execute(sql`insert into app.alert_settings (user_id, weekly_digest)
      values (${userId}::uuid, true)`);
    await matched(await search(userId, {}), [{}]);
    await weekly();
    expect(await outboxCount('notifications.email')).toBe(0);
  });
});
