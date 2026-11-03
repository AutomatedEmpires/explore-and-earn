import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../../tests/helpers/db';
import { queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import { setSetting } from '@/modules/settings';
import { schedules } from '@/server/schedules';
import { GET as unsubscribeGet, POST as unsubscribePost } from '@/app/api/v1/unsubscribe/route';
import {
  defineType,
  getPreferences,
  jobHandlers,
  markRead,
  notify,
  setPreference,
  suppressEmail,
} from '../index';
import { flushBatches } from '../batches';
import { sendEmailJob, stubOutbox } from './send';
import { buildUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe';

// The unsubscribe route reads the database through getDb(); point it at this file's PGlite.
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
const ADDRESS = '1 Harbor Road, Juneau, AK 99801';
const minutes = (n: number) => n * 60_000;

defineType({
  type: 'test.batched',
  category: 'messages',
  title: (d) => `New message from ${String(d.from)}`,
  body: (d) => `Message ${String(d.n)}`,
  email: { template: 'SystemTest', batch: { key: 'messages', delayMinutes: 15 } },
});

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
  stubOutbox.length = 0;
  await t.db.execute(
    sql`truncate app.notifications, app.notification_preferences, app.push_subscriptions,
      app.email_suppressions, app.notification_batches, app.outbox, app.settings, app.users cascade`,
  );
  await setSetting(t.db, 'business.mailing_address', ADDRESS, { operatorId: newId() });
});

async function newUser(email: string | null = 'maya@example.com'): Promise<string> {
  const id = newId();
  await t.db.execute(
    sql`insert into app.users (id, clerk_user_id, email) values (${id}, ${`user_${id}`}, ${email})`,
  );
  return id;
}

async function jobPayloads(topic: string): Promise<unknown[]> {
  const rows = await queryRows<{ payload: string }>(
    t.db,
    sql`select payload::text as payload from app.outbox where topic = ${topic} order by id`,
  );
  return rows.map((r) => JSON.parse(r.payload) as unknown);
}

async function batches(userId: string) {
  return queryRows<{ id: string; status: string }>(
    t.db,
    sql`select id, status from app.notification_batches where user_id = ${userId}`,
  );
}

describe('unsubscribe tokens', () => {
  it('round-trips the user and category', () => {
    const userId = newId();
    const token = buildUnsubscribeToken(userId, 'messages');
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyUnsubscribeToken(token)).toEqual({ userId, category: 'messages' });
  });

  it('rejects a token with any one character changed', () => {
    const token = buildUnsubscribeToken(newId(), 'account');
    for (let i = 0; i < token.length; i++) {
      const ch = token[i] === 'A' ? 'B' : 'A';
      const tampered = token.slice(0, i) + ch + token.slice(i + 1);
      expect(verifyUnsubscribeToken(tampered), `position ${i}`).toBeNull();
    }
  });

  it('rejects malformed tokens', () => {
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('abc')).toBeNull();
    expect(verifyUnsubscribeToken('a.b.c')).toBeNull();
    expect(verifyUnsubscribeToken('x'.repeat(5000))).toBeNull();
  });
});

describe('the notifications.email job', () => {
  it('sends system.test with both List-Unsubscribe headers and the mailing address', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'system.test', {});
    const [payload] = await jobPayloads('notifications.email');

    const handler = jobHandlers['notifications.email'];
    if (!handler) throw new Error('notifications.email handler is not registered');
    await handler(payload, { db: t.db, now: new Date() });

    expect(stubOutbox).toHaveLength(1);
    const [msg] = stubOutbox;
    expect(msg?.to).toBe('maya@example.com');
    expect(msg?.subject).toBe('Test notification');
    expect(msg?.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const header = msg?.headers['List-Unsubscribe'] ?? '';
    expect(header).toMatch(new RegExp(`^<${APP}/api/v1/unsubscribe\\?token=[A-Za-z0-9_.-]+>$`));
    const token = new URL(header.slice(1, -1)).searchParams.get('token') ?? '';
    expect(verifyUnsubscribeToken(token)).toEqual({ userId, category: 'account' });
    expect(msg?.html).toContain(ADDRESS);
    expect(msg?.html).toContain(`${APP}/notifications`);
    expect(msg?.text).toContain('Test notification');
  });

  it('is skipped when the address was suppressed after the job was queued', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'system.test', {});
    const [payload] = await jobPayloads('notifications.email');
    await suppressEmail(t.db, 'maya@example.com', 'complaint');

    expect(await sendEmailJob(t.db, payload)).toBe('skipped');
    expect(stubOutbox).toHaveLength(0);
  });

  it('is skipped when the preference was turned off after the job was queued', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'system.test', {});
    const [payload] = await jobPayloads('notifications.email');
    await setPreference(t.db, userId, 'account', 'email', false);

    expect(await sendEmailJob(t.db, payload)).toBe('skipped');
    expect(stubOutbox).toHaveLength(0);
  });

  it('still sends a mandatory type when the preference is off', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'operator.alert', {
      severity: 'critical',
      kind: 'child_safety',
      message: 'A child-safety item needs review',
    });
    const [payload] = await jobPayloads('notifications.email');
    await setPreference(t.db, userId, 'operator', 'email', false);

    expect(await sendEmailJob(t.db, payload)).toBe('sent');
    expect(stubOutbox[0]?.subject).toBe('Critical alert: child safety');
    expect(stubOutbox[0]?.html).toContain('A child-safety item needs review');
  });

  it('throws on a payload it cannot read, so the outbox retries and dead-letters it', async () => {
    await expect(sendEmailJob(t.db, { nope: true })).rejects.toThrow();
  });
});

describe('unsubscribe route', () => {
  it('POST with a valid token (one-click) disables the email preference', async () => {
    const userId = await newUser();
    const token = buildUnsubscribeToken(userId, 'messages');

    const res = await unsubscribePost(
      new Request(`${APP}/api/v1/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(await res.text()).toContain('unsubscribed');
    const prefs = await getPreferences(t.db, userId);
    expect(prefs.messages.email).toBe(false);
    expect(prefs.messages.push).toBe(true);
    expect(prefs.account.email).toBe(true);
  });

  it('POST with a tampered token changes nothing', async () => {
    const userId = await newUser();
    const token = buildUnsubscribeToken(userId, 'messages');
    const res = await unsubscribePost(
      new Request(`${APP}/api/v1/unsubscribe?token=${token.slice(0, -2)}xx`, { method: 'POST' }),
    );
    expect(res.status).toBe(400);
    expect((await getPreferences(t.db, userId)).messages.email).toBe(true);
  });

  it('GET shows a confirmation form and leaves the preference alone (link scanners prefetch GET)', async () => {
    const userId = await newUser();
    const token = buildUnsubscribeToken(userId, 'messages');
    const res = await unsubscribeGet(
      new Request(`${APP}/api/v1/unsubscribe?token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<form method="post"');
    expect(html).toContain(encodeURIComponent(token));
    expect((await getPreferences(t.db, userId)).messages.email).toBe(true);
  });
});

describe('batch flush', () => {
  it('runs every minute', () => {
    expect(schedules).toContainEqual({ topic: 'notifications.flush_batches', cron: '* * * * *' });
  });

  it('sends one digest listing only the notifications still unread', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'test.batched', { from: 'Kettle Ridge Lodge', n: 1 });
    await notify(t.db, userId, 'test.batched', { from: 'Kettle Ridge Lodge', n: 2 });
    const [first] = await queryRows<{ id: string }>(
      t.db,
      sql`select id from app.notifications where user_id = ${userId} order by id limit 1`,
    );
    await markRead(t.db, userId, [first?.id ?? '']);

    // Not due yet.
    expect(await flushBatches(t.db, new Date(Date.now() + minutes(10)))).toEqual({
      queued: 0,
      skipped: 0,
    });

    expect(await flushBatches(t.db, new Date(Date.now() + minutes(16)))).toEqual({
      queued: 1,
      skipped: 0,
    });
    expect((await batches(userId))[0]?.status).toBe('sent');

    await runWorker(t.db, { handlers: jobHandlers });

    expect(stubOutbox).toHaveLength(1);
    const [msg] = stubOutbox;
    expect(msg?.to).toBe('maya@example.com');
    expect(msg?.html).toContain('Message 2');
    expect(msg?.html).not.toContain('Message 1');
    expect(msg?.headers['List-Unsubscribe']).toBeTruthy();
    expect(msg?.html).toContain(ADDRESS);
  });

  it('sends nothing for a batch whose notifications were all read, and marks it sent', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'test.batched', { from: 'Kettle Ridge Lodge', n: 1 });
    await notify(t.db, userId, 'test.batched', { from: 'Kettle Ridge Lodge', n: 2 });
    await markRead(t.db, userId, 'all');

    const handler = jobHandlers['notifications.flush_batches'];
    if (!handler) throw new Error('notifications.flush_batches handler is not registered');
    await handler(null, { db: t.db, now: new Date(Date.now() + minutes(16)) });

    expect((await batches(userId))[0]?.status).toBe('sent');
    expect(await jobPayloads('notifications.email')).toHaveLength(0);
    await runWorker(t.db, { handlers: jobHandlers });
    expect(stubOutbox).toHaveLength(0);
  });

  it('starts a new batch after the previous one was flushed', async () => {
    const userId = await newUser();
    await notify(t.db, userId, 'test.batched', { from: 'A', n: 1 });
    await flushBatches(t.db, new Date(Date.now() + minutes(16)));
    await notify(t.db, userId, 'test.batched', { from: 'A', n: 2 });
    const rows = await batches(userId);
    expect(rows.map((r) => r.status).sort()).toEqual(['pending', 'sent']);
  });
});
