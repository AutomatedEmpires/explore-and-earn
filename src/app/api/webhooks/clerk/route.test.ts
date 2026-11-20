// POST /api/webhooks/clerk end to end on PGlite: a real Svix (Standard Webhooks) signature, the
// apiRoute envelope, idempotent redelivery and the audit row.
//
// The route is imported statically: apiRoute loads every SP2 module (src/server/sp2-wiring.ts),
// and importing that graph inside a test counted against the test timeout and timed out under a
// loaded full run. The mocks below are hoisted above this import, and the route reads the env
// and the database only per request.
import { createHmac, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { createTestDb, type TestDb } from '../../../../../tests/helpers/db';
import { POST } from './route';

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

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureMessage: sentry.captureMessage,
}));

const SECRET = `whsec_${randomBytes(24).toString('base64')}`;
const previousSecret = process.env.CLERK_WEBHOOK_SECRET;
let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
  process.env.CLERK_WEBHOOK_SECRET = SECRET;
  resetEnvCache();
});

afterAll(async () => {
  if (previousSecret === undefined) delete process.env.CLERK_WEBHOOK_SECRET;
  else process.env.CLERK_WEBHOOK_SECRET = previousSecret;
  resetEnvCache();
  await t.close();
});

beforeEach(async () => {
  sentry.captureMessage.mockClear();
  await t.db.execute(
    sql`truncate app.org_memberships, app.organizations, app.operators, app.users, app.webhook_events cascade`,
  );
});

function sign(id: string, timestamp: number, body: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${signature}`;
}

function delivery(id: string, payload: unknown, opts: { secret?: string } = {}): Request {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  return new Request('http://localhost:3000/api/webhooks/clerk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(timestamp),
      'svix-signature': sign(id, timestamp, body, opts.secret),
    },
    body,
  });
}

const userCreated = {
  type: 'user.created',
  object: 'event',
  data: {
    object: 'user',
    id: 'user_webhook_route',
    first_name: 'Maya',
    last_name: 'Rodriguez',
    primary_email_address_id: 'idn_primary',
    email_addresses: [
      { object: 'email_address', id: 'idn_primary', email_address: 'maya@example.test' },
    ],
    public_metadata: {},
    private_metadata: {},
    unsafe_metadata: {},
    two_factor_enabled: false,
    created_at: Date.parse('2026-11-01T00:00:00Z'),
    updated_at: Date.parse('2026-11-01T00:00:00Z'),
  },
};

const auditRows = () =>
  queryRows<{ action: string; subject_id: string; request_id: string | null }>(
    t.db,
    sql`select action, subject_id, request_id from app.audit_events
        where subject_type = 'clerk_event' order by id`,
  );

type Envelope = { error: { code: string; message: string; requestId: string } };

describe('POST /api/webhooks/clerk', () => {
  // The route's first import loads Clerk, Sentry and svix cold. Pay that here, under the hook
  // timeout, not inside the first test's 30 s budget on a loaded machine.
  beforeAll(async () => {
    await import('./route');
  });

  it('applies a signed event once, audits it, and treats a redelivery as a duplicate', async () => {
    const before = (await auditRows()).length;

    const first = await POST(delivery('msg_route_1', userCreated));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, result: 'applied' });
    const requestId = first.headers.get('x-request-id');
    expect(requestId).toBeTruthy();

    const users = await queryRows<{ clerk_user_id: string }>(
      t.db,
      sql`select clerk_user_id from app.users`,
    );
    expect(users.map((u) => u.clerk_user_id)).toEqual(['user_webhook_route']);

    const again = await POST(delivery('msg_route_1', userCreated));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, result: 'duplicate' });

    const audited = (await auditRows()).slice(before);
    expect(audited).toEqual([
      { action: 'identity.clerk_webhook', subject_id: 'msg_route_1', request_id: requestId },
    ]);
  });

  it('returns 400 in the error envelope for a bad signature and applies nothing', async () => {
    const wrongSecret = `whsec_${randomBytes(24).toString('base64')}`;
    const res = await POST(delivery('msg_route_2', userCreated, { secret: wrongSecret }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as Envelope;
    expect(json.error.code).toBe('bad_request');
    expect(json.error.message).toBe('Invalid webhook signature');
    expect(json.error.requestId).toBe(res.headers.get('x-request-id'));

    const seen = await queryRows(t.db, sql`select id from app.webhook_events`);
    expect(seen).toEqual([]);
  });

  it('returns 400 for missing Svix headers', async () => {
    const res = await POST(
      new Request('http://localhost:3000/api/webhooks/clerk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(userCreated),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as Envelope).error.code).toBe('bad_request');
  });

  it('answers 200 for an event that can never apply, so Clerk stops retrying, and alerts', async () => {
    const { logger } = await import('@/lib/logger');
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const invalid = { type: 'user.created', object: 'event', data: { id: 42 } };

    const res = await POST(delivery('msg_route_3', invalid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: 'rejected' });
    const requestId = res.headers.get('x-request-id');

    const seen = await queryRows<{ id: string; status: string }>(
      t.db,
      sql`select id, status from app.webhook_events`,
    );
    expect(seen).toEqual([{ id: 'msg_route_3', status: 'rejected' }]);
    expect((await auditRows()).filter((r) => r.subject_id === 'msg_route_3')).toEqual([
      {
        action: 'identity.clerk_webhook_rejected',
        subject_id: 'msg_route_3',
        request_id: requestId,
      },
    ]);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('rejected'),
      expect.objectContaining({
        level: 'error',
        tags: expect.objectContaining({ eventId: 'msg_route_3', type: 'user.created' }),
      }),
    );

    // Clerk's redelivery of the same message is a no-op and raises no second alert.
    const again = await POST(delivery('msg_route_3', invalid));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, result: 'duplicate' });
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });
});
