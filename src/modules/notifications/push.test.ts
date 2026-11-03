import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { requireUser, type CurrentUser } from '@/server/guards';
import {
  DELETE as deleteRoute,
  GET as keyRoute,
  POST as subscribeRoute,
} from '@/app/api/v1/push/subscriptions/route';
import { jobHandlers, notify, setPreference } from './index';
import { isAllowedPushEndpoint, removeSubscription, sendPushJob, upsertSubscription } from './push';

const webpush = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock('web-push', () => ({ default: webpush }));

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

const APP = 'http://localhost:3000';
const FCM = 'https://fcm.googleapis.com/fcm/send/';
const MOZ = 'https://updates.push.services.mozilla.com/wpush/v2/';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(async () => {
  webpush.sendNotification.mockReset();
  vi.restoreAllMocks();
  await t.db.execute(
    sql`truncate app.notifications, app.notification_preferences, app.push_subscriptions,
      app.notification_batches, app.outbox, app.users cascade`,
  );
});

async function newUser(): Promise<string> {
  const id = newId();
  await t.db.execute(
    sql`insert into app.users (id, clerk_user_id, email) values (${id}, ${`user_${id}`}, 'maya@example.com')`,
  );
  return id;
}

function keys() {
  return { p256dh: `BP${newId().replaceAll('-', '')}`, auth: 'kM1mRZ2Xc9DZ1k7CgqfH0A' };
}

async function subscriptions(userId?: string) {
  return queryRows<{ endpoint: string; user_id: string; last_success_at: string | null }>(
    t.db,
    userId
      ? sql`select endpoint, user_id, last_success_at from app.push_subscriptions where user_id = ${userId} order by id`
      : sql`select endpoint, user_id, last_success_at from app.push_subscriptions order by id`,
  );
}

async function pushPayload(): Promise<unknown> {
  const [row] = await queryRows<{ payload: string }>(
    t.db,
    sql`select payload::text as payload from app.outbox where topic = 'notifications.push'`,
  );
  if (!row) throw new Error('no push job');
  return JSON.parse(row.payload) as unknown;
}

function pushError(statusCode: number): Error {
  return Object.assign(new Error('Received unexpected response code'), {
    name: 'WebPushError',
    statusCode,
    headers: {},
    body: '',
  });
}

describe('the notifications.push job', () => {
  it('deletes a subscription that answers 410 and stamps the one that succeeds', async () => {
    const userId = await newUser();
    const gone = `${FCM}gone`;
    const alive = `${MOZ}alive`;
    await upsertSubscription(t.db, userId, { endpoint: gone, keys: keys() });
    await upsertSubscription(t.db, userId, { endpoint: alive, keys: keys() });
    await notify(t.db, userId, 'system.test', {});

    webpush.sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === gone) throw pushError(410);
      return { statusCode: 201, body: '', headers: {} };
    });

    const handler = jobHandlers['notifications.push'];
    if (!handler) throw new Error('notifications.push handler is not registered');
    await handler(await pushPayload(), { db: t.db, now: new Date() });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const rows = await subscriptions(userId);
    expect(rows.map((r) => r.endpoint)).toEqual([alive]);
    expect(rows[0]?.last_success_at).not.toBeNull();
  });

  it('sends the title, body and url, with the VAPID details', async () => {
    const userId = await newUser();
    await upsertSubscription(t.db, userId, { endpoint: `${FCM}a`, keys: keys() });
    await notify(t.db, userId, 'system.test', {});
    webpush.sendNotification.mockResolvedValue({ statusCode: 201, body: '', headers: {} });

    expect(await sendPushJob(t.db, await pushPayload())).toEqual({
      sent: 1,
      removed: 0,
      failed: 0,
    });

    const [sub, body, options] = webpush.sendNotification.mock.calls[0] as [
      { endpoint: string; keys: { p256dh: string; auth: string } },
      string,
      { vapidDetails: { subject: string; publicKey: string; privateKey: string }; TTL: number },
    ];
    expect(sub.endpoint).toBe(`${FCM}a`);
    expect(sub.keys.auth).toBe('kM1mRZ2Xc9DZ1k7CgqfH0A');
    const message = JSON.parse(body) as { title: string; body: string; data: { url: string } };
    expect(message.title).toBe('Test notification');
    expect(message.body).toBeTruthy();
    expect(message.data.url).toBe(`${APP}/notifications`);
    expect(options.vapidDetails.subject).toBe('mailto:dev@localhost');
    expect(options.TTL).toBeGreaterThan(0);
  });

  it('deletes on 404 too, and throws (to retry) when every send failed for another reason', async () => {
    const userId = await newUser();
    await upsertSubscription(t.db, userId, { endpoint: `${FCM}missing`, keys: keys() });
    await upsertSubscription(t.db, userId, { endpoint: `${FCM}flaky`, keys: keys() });
    await notify(t.db, userId, 'system.test', {});
    webpush.sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      throw pushError(sub.endpoint.endsWith('missing') ? 404 : 503);
    });
    vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await expect(sendPushJob(t.db, await pushPayload())).rejects.toThrow(/push/i);
    expect((await subscriptions(userId)).map((r) => r.endpoint)).toEqual([`${FCM}flaky`]);
  });

  it('skips when push was turned off for the category after the job was queued', async () => {
    const userId = await newUser();
    await upsertSubscription(t.db, userId, { endpoint: `${FCM}a`, keys: keys() });
    await notify(t.db, userId, 'system.test', {});
    await setPreference(t.db, userId, 'account', 'push', false);

    expect(await sendPushJob(t.db, await pushPayload())).toEqual({
      sent: 0,
      removed: 0,
      failed: 0,
    });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('throws on a payload it cannot read', async () => {
    await expect(sendPushJob(t.db, { nope: 1 })).rejects.toThrow();
  });
});

describe('subscriptions', () => {
  it('upserting the same endpoint twice leaves one row, with the newest keys and owner', async () => {
    const a = await newUser();
    const b = await newUser();
    const endpoint = `${FCM}device`;
    await upsertSubscription(t.db, a, { endpoint, keys: keys() });
    const latest = keys();
    await upsertSubscription(t.db, b, { endpoint, keys: latest });

    const rows = await queryRows<{ user_id: string; p256dh: string }>(
      t.db,
      sql`select user_id, p256dh from app.push_subscriptions where endpoint = ${endpoint}`,
    );
    expect(rows).toEqual([{ user_id: b, p256dh: latest.p256dh }]);
  });

  it('removes only the caller’s own subscription', async () => {
    const a = await newUser();
    const b = await newUser();
    await upsertSubscription(t.db, a, { endpoint: `${FCM}a`, keys: keys() });
    expect(await removeSubscription(t.db, b, `${FCM}a`)).toBe(false);
    expect(await subscriptions()).toHaveLength(1);
    expect(await removeSubscription(t.db, a, `${FCM}a`)).toBe(true);
    expect(await subscriptions()).toHaveLength(0);
  });

  it('accepts only https endpoints on known push services', () => {
    expect(isAllowedPushEndpoint(`${FCM}x`)).toBe(true);
    expect(isAllowedPushEndpoint(`${MOZ}x`)).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedPushEndpoint('https://evilfcm.googleapis.com.example/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://notfcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('not a url')).toBe(false);
  });
});

describe('push subscription routes', () => {
  function signIn(userId: string) {
    const user: CurrentUser = {
      id: userId,
      clerkUserId: `user_${userId}`,
      accountType: 'seeker',
      email: 'maya@example.com',
    };
    vi.mocked(requireUser).mockResolvedValue(user);
  }

  const call = (method: 'POST' | 'DELETE', body: unknown) =>
    (method === 'POST' ? subscribeRoute : deleteRoute)(
      new Request(`${APP}/api/v1/push/subscriptions`, {
        method,
        headers: { 'content-type': 'application/json', origin: APP },
        body: JSON.stringify(body),
      }),
    );

  it('POST upserts the browser subscription (PushSubscription.toJSON shape)', async () => {
    const userId = await newUser();
    signIn(userId);
    const sub = { endpoint: `${FCM}route`, expirationTime: null, keys: keys() };

    expect((await call('POST', sub)).status).toBe(204);
    expect((await call('POST', sub)).status).toBe(204);
    expect(await subscriptions(userId)).toHaveLength(1);
  });

  it('POST rejects an endpoint outside the known push services', async () => {
    signIn(await newUser());
    const res = await call('POST', { endpoint: 'https://internal.example/hook', keys: keys() });
    expect(res.status).toBe(400);
    expect(await subscriptions()).toHaveLength(0);
  });

  it('DELETE removes the subscription', async () => {
    const userId = await newUser();
    signIn(userId);
    await upsertSubscription(t.db, userId, { endpoint: `${FCM}bye`, keys: keys() });
    expect((await call('DELETE', { endpoint: `${FCM}bye` })).status).toBe(204);
    expect(await subscriptions(userId)).toHaveLength(0);
  });

  it('GET returns the VAPID public key for pushManager.subscribe', async () => {
    signIn(await newUser());
    const res = await keyRoute(new Request(`${APP}/api/v1/push/subscriptions`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicKey: 'dev-placeholder-vapid-public-key' });
  });
});
