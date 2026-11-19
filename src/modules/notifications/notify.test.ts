import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows, withTx, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { getCounts } from '@/server/counts';
import { requireUser, type CurrentUser } from '@/server/guards';
import { GET as listRoute } from '@/app/api/v1/notifications/route';
import { POST as readRoute } from '@/app/api/v1/notifications/read/route';
import {
  defineType,
  getPreferences,
  listNotifications,
  markRead,
  notify,
  setPreference,
  suppressEmail,
  unreadCount,
} from './index';

// The routes read the database through getDb(); point it at this file's PGlite.
const dbHolder = vi.hoisted(() => ({ current: undefined as Db | undefined }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getDb: () => {
      if (!dbHolder.current) throw new Error('test db not ready');
      return dbHolder.current;
    },
  };
});

vi.mock('@/server/guards', () => ({
  requireUser: vi.fn(),
  requireSeeker: vi.fn(),
  requireHost: vi.fn(),
  requireOperator: vi.fn(),
}));

let t: TestDb;

const T0 = new Date('2026-11-03T10:00:00.000Z');
const minutes = (n: number) => n * 60_000;

// A batched type, like the message emails later sub-projects add.
defineType({
  type: 'test.batched',
  category: 'messages',
  title: (d) => `New message from ${String(d.from)}`,
  body: () => 'Open the inbox to reply.',
  email: { template: 'SystemTest', batch: { key: 'messages', delayMinutes: 15 } },
});

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(
    sql`truncate app.notifications, app.notification_preferences, app.push_subscriptions,
      app.email_suppressions, app.notification_batches, app.outbox, app.users cascade`,
  );
});

afterEach(() => {
  vi.useRealTimers();
});

async function newUser(db: Db = t.db, email: string | null = 'maya@example.com'): Promise<string> {
  const id = newId();
  await db.execute(
    sql`insert into app.users (id, clerk_user_id, email) values (${id}, ${`user_${id}`}, ${email})`,
  );
  return id;
}

type Job = { topic: string; payload: unknown; dedupe_key: string | null };

async function jobs(topic?: string): Promise<Job[]> {
  const rows = await queryRows<{ topic: string; payload: string; dedupe_key: string | null }>(
    t.db,
    sql`select topic, payload::text as payload, dedupe_key from app.outbox order by id`,
  );
  return rows
    .map((r) => ({
      topic: r.topic,
      payload: JSON.parse(r.payload) as unknown,
      dedupe_key: r.dedupe_key,
    }))
    .filter((r) => topic === undefined || r.topic === topic);
}

async function inApp(userId: string) {
  return queryRows<{ id: string; type: string; category: string; title: string; body: string }>(
    t.db,
    sql`select id, type, category, title, body from app.notifications where user_id = ${userId}`,
  );
}

async function addPushSubscription(userId: string): Promise<void> {
  await t.db.execute(sql`
    insert into app.push_subscriptions (id, user_id, endpoint, p256dh, auth)
    values (${newId()}, ${userId}, ${`https://fcm.googleapis.com/fcm/send/${newId()}`}, 'p', 'a')
  `);
}

describe('notify', () => {
  it('writes one in-app row and enqueues one email job for system.test', async () => {
    const userId = await newUser();

    await notify(t.db, userId, 'system.test', {});

    const rows = await inApp(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe('system.test');
    expect(rows[0]?.category).toBe('account');
    expect(rows[0]?.title).toBeTruthy();

    const email = await jobs('notifications.email');
    expect(email).toHaveLength(1);
    expect(email[0]?.payload).toEqual({ notificationId: rows[0]?.id });
    expect(email[0]?.dedupe_key).toBe(`notif:${rows[0]?.id}:email`);
    // No push subscription, so no push job.
    expect(await jobs('notifications.push')).toHaveLength(0);
  });

  it('skips the email when the email preference for the category is disabled', async () => {
    const userId = await newUser();
    await setPreference(t.db, userId, 'account', 'email', false);

    await notify(t.db, userId, 'system.test', {});

    expect(await inApp(userId)).toHaveLength(1);
    expect(await jobs('notifications.email')).toHaveLength(0);
  });

  it('ignores a disabled preference for a mandatory type (operator.alert)', async () => {
    const userId = await newUser();
    await setPreference(t.db, userId, 'operator', 'email', false);
    await setPreference(t.db, userId, 'operator', 'push', false);
    await addPushSubscription(userId);

    await notify(t.db, userId, 'operator.alert', {
      severity: 'critical',
      kind: 'child_safety',
      message: 'A child-safety item needs review',
    });

    expect(await jobs('notifications.email')).toHaveLength(1);
    expect(await jobs('notifications.push')).toHaveLength(1);
  });

  it('enqueues a push job when the user has a subscription and push is enabled', async () => {
    const userId = await newUser();
    await addPushSubscription(userId);

    await notify(t.db, userId, 'system.test', {});
    const [row] = await inApp(userId);
    const push = await jobs('notifications.push');
    expect(push).toHaveLength(1);
    expect(push[0]?.dedupe_key).toBe(`notif:${row?.id}:push`);

    await setPreference(t.db, userId, 'account', 'push', false);
    await notify(t.db, userId, 'system.test', {});
    expect(await jobs('notifications.push')).toHaveLength(1);
  });

  it('sends no email to a suppressed address (compared case-insensitively)', async () => {
    const userId = await newUser(t.db, 'Maya@Example.com');
    await suppressEmail(t.db, 'maya@example.COM', 'bounce');

    await notify(t.db, userId, 'system.test', {});

    expect(await inApp(userId)).toHaveLength(1);
    expect(await jobs('notifications.email')).toHaveLength(0);
  });

  it('sends no email to a user without an address', async () => {
    const userId = await newUser(t.db, null);
    await notify(t.db, userId, 'system.test', {});
    expect(await inApp(userId)).toHaveLength(1);
    expect(await jobs('notifications.email')).toHaveLength(0);
  });

  it('appends a batched type to one pending batch that is due 15 minutes after the first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const userId = await newUser();

    vi.setSystemTime(T0);
    await notify(t.db, userId, 'test.batched', { from: 'Kettle Ridge Lodge' });
    vi.setSystemTime(new Date(T0.getTime() + minutes(5)));
    await notify(t.db, userId, 'test.batched', { from: 'Kettle Ridge Lodge' });

    const batches = await queryRows<{
      batch_key: string;
      channel: string;
      ids: string;
      send_after: string;
      status: string;
    }>(
      t.db,
      sql`select batch_key, channel, array_to_json(notification_ids)::text as ids,
            send_after, status
          from app.notification_batches where user_id = ${userId}`,
    );
    expect(batches).toHaveLength(1);
    const [batch] = batches;
    const ids = (await inApp(userId)).map((r) => r.id).sort();
    expect((JSON.parse(batch?.ids ?? '[]') as string[]).sort()).toEqual(ids);
    expect(ids).toHaveLength(2);
    expect(batch?.batch_key).toBe('messages');
    expect(batch?.channel).toBe('email');
    expect(batch?.status).toBe('pending');
    expect(new Date(batch?.send_after ?? '').toISOString()).toBe(
      new Date(T0.getTime() + minutes(15)).toISOString(),
    );
    // Batched emails are not enqueued one by one.
    expect(await jobs('notifications.email')).toHaveLength(0);
  });

  it('is part of the caller transaction, so a rollback drops the row and the jobs', async () => {
    const userId = await newUser();
    await expect(
      withTx(t.db, async (tx) => {
        await notify(tx, userId, 'system.test', {});
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await inApp(userId)).toHaveLength(0);
    expect(await jobs()).toHaveLength(0);
  });

  it('throws for an unknown type', async () => {
    const userId = await newUser();
    await expect(notify(t.db, userId, 'no.such.type', {})).rejects.toThrow('no.such.type');
  });
});

describe('defineType', () => {
  it('refuses to define the same type twice', () => {
    expect(() =>
      defineType({
        type: 'system.test',
        category: 'account',
        title: () => 'x',
        body: () => 'y',
      }),
    ).toThrow('system.test');
  });
});

describe('unreadCount and markRead', () => {
  it('counts unread notifications and clears them with markRead("all")', async () => {
    const userId = await newUser();
    const other = await newUser(t.db, 'bo@example.com');
    await notify(t.db, userId, 'system.test', {});
    await notify(t.db, other, 'system.test', {});

    expect(await unreadCount(t.db, userId)).toBe(1);
    await markRead(t.db, userId, 'all');
    expect(await unreadCount(t.db, userId)).toBe(0);
    // Another user's notifications are untouched.
    expect(await unreadCount(t.db, other)).toBe(1);
  });

  it('marks only the given ids, and only the user’s own', async () => {
    const userId = await newUser();
    const other = await newUser(t.db, 'bo@example.com');
    await notify(t.db, userId, 'system.test', {});
    await notify(t.db, userId, 'system.test', {});
    await notify(t.db, other, 'system.test', {});
    const [first] = await inApp(userId);
    const [theirs] = await inApp(other);

    await markRead(t.db, userId, [first?.id ?? '', theirs?.id ?? '']);

    expect(await unreadCount(t.db, userId)).toBe(1);
    expect(await unreadCount(t.db, other)).toBe(1);
    await markRead(t.db, userId, []);
    expect(await unreadCount(t.db, userId)).toBe(1);
  });

  it('feeds getCounts', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'system.test', {});
    await notify(t.db, userId, 'system.test', {});
    expect(await getCounts(t.db, userId)).toMatchObject({ inbox: 0, notifications: 2 });
  });
});

describe('listNotifications', () => {
  it('pages newest first with nextBefore', async () => {
    const userId = await newUser();
    for (let i = 0; i < 3; i++) await notify(t.db, userId, 'system.test', {});

    const page1 = await listNotifications(t.db, userId, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextBefore).not.toBeNull();
    expect(page1.items[0]?.id.localeCompare(page1.items[1]?.id ?? '')).toBeGreaterThan(0);
    expect(page1.items[0]?.readAt).toBeNull();

    const page2 = await listNotifications(t.db, userId, {
      limit: 2,
      before: page1.nextBefore ?? undefined,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextBefore).toBeNull();
  });
});

describe('preferences', () => {
  it('defaults every category and channel to enabled, and stores changes', async () => {
    const userId = await newUser();
    const before = await getPreferences(t.db, userId);
    expect(before.account).toEqual({ email: true, push: true });

    await setPreference(t.db, userId, 'account', 'email', false);
    await setPreference(t.db, userId, 'account', 'email', false);
    const after = await getPreferences(t.db, userId);
    expect(after.account).toEqual({ email: false, push: true });
    expect(after.messages).toEqual({ email: true, push: true });
  });
});

describe('notification routes', () => {
  const APP = 'http://localhost:3000';

  function signIn(userId: string) {
    const user: CurrentUser = {
      id: userId,
      clerkUserId: `user_${userId}`,
      accountType: 'seeker',
      email: 'maya@example.com',
    };
    vi.mocked(requireUser).mockResolvedValue(user);
  }

  it('GET lists the signed-in user’s notifications with the unread count', async () => {
    const userId = await newUser();
    const other = await newUser(t.db, 'bo@example.com');
    await notify(t.db, userId, 'system.test', {});
    await notify(t.db, other, 'system.test', {});
    signIn(userId);

    const res = await listRoute(new Request(`${APP}/api/v1/notifications?limit=10`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { type: string; url: string | null; readAt: string | null }[];
      nextBefore: string | null;
      unread: number;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.type).toBe('system.test');
    expect(body.items[0]?.url).toBe(`${APP}/notifications`);
    expect(body.items[0]?.readAt).toBeNull();
    expect(body.nextBefore).toBeNull();
    expect(body.unread).toBe(1);
  });

  it('GET rejects a malformed cursor', async () => {
    signIn(await newUser());
    const res = await listRoute(new Request(`${APP}/api/v1/notifications?before=nope`));
    expect(res.status).toBe(400);
  });

  it('POST /read marks ids or everything read and returns the unread count', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'system.test', {});
    await notify(t.db, userId, 'system.test', {});
    const [first] = await inApp(userId);
    signIn(userId);

    const post = (ids: unknown) =>
      readRoute(
        new Request(`${APP}/api/v1/notifications/read`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: APP },
          body: JSON.stringify({ ids }),
        }),
      );

    const one = await post([first?.id]);
    expect(one.status).toBe(200);
    expect(await one.json()).toEqual({ unread: 1 });

    const all = await post('all');
    expect(await all.json()).toEqual({ unread: 0 });

    expect((await post([])).status).toBe(400);
    expect((await post(['not-a-uuid'])).status).toBe(400);
  });
});
