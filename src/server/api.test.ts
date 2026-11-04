import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createTestDb, type TestDb } from '../../tests/helpers/db';
import { sql } from 'drizzle-orm';
import { users } from '@/db/schema';
import { queryRows, type Db } from '@/lib/db';
import { notFound, unauthorized } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import { GET as health } from '@/app/api/v1/health/route';
import { apiRoute, toErrorResponse } from './api';
import { requireHost, requireUser, type CurrentUser } from './guards';

const state = vi.hoisted(() => ({ db: undefined as Db | undefined }));

// Route handlers get the PGlite test database instead of DATABASE_URL.
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getDb: () => {
      if (!state.db) throw new Error('test db not ready');
      return state.db;
    },
  };
});

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureException: sentry.captureException,
}));

// The real guards need a Clerk request; each test decides what they return.
vi.mock('./guards', () => ({
  requireUser: vi.fn(),
  requireSeeker: vi.fn(),
  requireHost: vi.fn(),
  requireOperator: vi.fn(),
}));

const APP_URL = 'http://localhost:3000';

const user: CurrentUser = {
  id: '0190f7a2-0000-7000-8000-000000000001',
  clerkUserId: 'user_1',
  accountType: 'seeker',
  email: 'seeker@example.test',
};

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_URL, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

type ErrorBody = {
  error: { code: string; message: string; details?: unknown; requestId: string };
};

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  state.db = t.db;
});

afterAll(async () => {
  state.db = undefined;
  await t.close();
});

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  vi.mocked(requireHost).mockReset();
});

describe('apiRoute errors', () => {
  it('turns a thrown AppError into the error envelope with its status', async () => {
    const route = apiRoute({
      handler: async () => {
        throw notFound('x');
      },
    });
    const res = await route(new Request(`${APP_URL}/api/v1/thing`));

    expect(res.status).toBe(404);
    const requestId = res.headers.get('x-request-id');
    expect(requestId).toBeTruthy();
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'x', requestId } });
  });

  it('hides the message of an unknown error, returns 500 internal and logs it', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const route = apiRoute({
      handler: async () => {
        throw new Error('db password=hunter2 refused');
      },
    });
    const res = await route(new Request(`${APP_URL}/api/v1/thing`));

    expect(res.status).toBe(500);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('internal');
    expect(body.error.message).toBe('Internal error');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[1]).toMatchObject({ requestId: body.error.requestId });
    logged.mockRestore();
  });

  it("never sends a failed query's parameters to the log or to Sentry", async () => {
    const email = 'maya.private@example.test';
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    sentry.captureException.mockClear();
    const route = apiRoute({
      handler: async ({ db }) => {
        // Violates the account_type CHECK constraint; drizzle's message lists the values.
        await db.insert(users).values({
          id: newId(),
          clerkUserId: 'user_api_pii',
          email,
          accountType: 'bogus' as 'seeker',
        });
      },
    });

    const res = await route(new Request(`${APP_URL}/api/v1/thing`));

    expect(res.status).toBe(500);
    const [reported] = sentry.captureException.mock.calls[0] ?? [];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).message).toContain('Failed query: insert into');
    expect(`${(reported as Error).message}${(reported as Error).stack}`).not.toContain(email);
    expect(logged.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain(email);
    logged.mockRestore();
  });

  it('toErrorResponse keeps details and sets the request id header', async () => {
    const res = toErrorResponse(unauthorized('Sign in', { hint: 'cookie' }), 'req-12345678');
    expect(res.status).toBe(401);
    expect(res.headers.get('x-request-id')).toBe('req-12345678');
    expect(await res.json()).toEqual({
      error: {
        code: 'unauthorized',
        message: 'Sign in',
        details: { hint: 'cookie' },
        requestId: 'req-12345678',
      },
    });
  });
});

describe('apiRoute request context', () => {
  it("gives audit rows and log lines written in a handler the request's id and hashed IP", async () => {
    const action = `test.api_ctx.${newId()}`;
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => void lines.push(String(line)));
    const route = apiRoute({
      handler: async ({ db, user }) => {
        logger.info('deep inside a module');
        await record(db, {
          actorType: 'user',
          actorId: user?.id ?? newId(),
          action,
          subjectType: 'test_item',
          subjectId: null,
        });
      },
    });

    const res = await route(
      new Request(`${APP_URL}/api/v1/thing`, { headers: { 'x-forwarded-for': '203.0.113.7' } }),
    );
    const requestId = res.headers.get('x-request-id');

    const [row] = await queryRows<{ request_id: string | null; ip_hash: string | null }>(
      state.db as Db,
      sql`select request_id, ip_hash from app.audit_events where action = ${action}`,
    );
    expect(row?.request_id).toBe(requestId);
    expect(row?.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(row?.ip_hash).not.toContain('203.0.113.7');
    expect(JSON.parse(lines.find((l) => l.includes('deep inside')) ?? '{}')).toMatchObject({
      requestId,
    });
    vi.mocked(console.log).mockRestore();
  });
});

describe('apiRoute request ids', () => {
  it('puts x-request-id on every response and hands the same id to the handler', async () => {
    let seen = '';
    const route = apiRoute({
      handler: async (ctx) => {
        seen = ctx.requestId;
        return { ok: true };
      },
    });
    const res = await route(new Request(`${APP_URL}/api/v1/thing`));

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBe(seen);
    expect(seen).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('reuses a well-formed incoming x-request-id (set by the proxy) and ignores a bad one', async () => {
    const route = apiRoute({ handler: async () => ({ ok: true }) });

    const kept = await route(
      new Request(`${APP_URL}/api/v1/thing`, { headers: { 'x-request-id': 'abcdef12-3456' } }),
    );
    expect(kept.headers.get('x-request-id')).toBe('abcdef12-3456');

    const replaced = await route(
      new Request(`${APP_URL}/api/v1/thing`, { headers: { 'x-request-id': 'bad id <script>' } }),
    );
    expect(replaced.headers.get('x-request-id')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });
});

describe('apiRoute origin check', () => {
  const route = apiRoute({
    input: z.object({ name: z.string() }),
    handler: async ({ input }) => ({ hello: input.name }),
  });

  it('rejects a POST from another origin with 403', async () => {
    const res = await route(post('/api/v1/thing', { name: 'a' }, { origin: 'https://evil.test' }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorBody).error.code).toBe('forbidden');
  });

  it('rejects Origin: null', async () => {
    const res = await route(post('/api/v1/thing', { name: 'a' }, { origin: 'null' }));
    expect(res.status).toBe(403);
  });

  it('accepts the app origin and the admin origin', async () => {
    expect((await route(post('/api/v1/thing', { name: 'a' }))).status).toBe(200);
    const admin = await route(
      post('/api/v1/thing', { name: 'a' }, { origin: 'https://admin.localhost:3000' }),
    );
    expect(admin.status).toBe(200);
  });

  it('rejects a cross-site request that carries no Origin header', async () => {
    const req = new Request(`${APP_URL}/api/v1/thing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ name: 'a' }),
    });
    expect((await route(req)).status).toBe(403);
  });

  it('does not check the origin of a GET', async () => {
    const get = apiRoute({ handler: async () => ({ ok: true }) });
    const res = await get(
      new Request(`${APP_URL}/api/v1/thing`, { headers: { origin: 'https://evil.test' } }),
    );
    expect(res.status).toBe(200);
  });
});

describe('apiRoute input', () => {
  it('returns 400 bad_request with the zod issues as details for an invalid body', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const route = apiRoute({ input: z.object({ name: z.string().min(2) }), handler });
    const res = await route(post('/api/v1/thing', { name: 1 }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('bad_request');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect((body.error.details as unknown[]).length).toBeGreaterThan(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 400 for a body that is not JSON', async () => {
    const route = apiRoute({ input: z.object({ name: z.string() }), handler: async () => 1 });
    const res = await route(post('/api/v1/thing', '{not json'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe('bad_request');
  });

  it('returns 400 for a body sent as a form instead of JSON', async () => {
    const route = apiRoute({ input: z.object({ name: z.string() }), handler: async () => 1 });
    const res = await route(
      post('/api/v1/thing', 'name=a', { 'content-type': 'application/x-www-form-urlencoded' }),
    );
    expect(res.status).toBe(400);
  });

  it('reads GET input from the query string', async () => {
    const route = apiRoute({
      input: z.object({ q: z.string(), limit: z.coerce.number().int(), tag: z.array(z.string()) }),
      handler: async ({ input }) => input,
    });
    const res = await route(new Request(`${APP_URL}/api/v1/search?q=boat&limit=5&tag=a&tag=b`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ q: 'boat', limit: 5, tag: ['a', 'b'] });
  });

  it('merges dynamic route params into the input', async () => {
    const route = apiRoute({
      input: z.object({ id: z.string(), note: z.string() }),
      handler: async ({ input }) => input,
    });
    const res = await route(post('/api/v1/things/42', { note: 'hi', id: 'spoofed' }), {
      params: Promise.resolve({ id: '42' }),
    });
    expect(await res.json()).toEqual({ id: '42', note: 'hi' });
  });

  it('returns 204 when the handler returns nothing', async () => {
    const route = apiRoute({ handler: async () => undefined });
    const res = await route(post('/api/v1/thing', ''));
    expect(res.status).toBe(204);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('passes a Response from the handler through, adding the request id', async () => {
    const route = apiRoute({
      handler: async () => new Response('raw', { headers: { 'content-type': 'text/plain' } }),
    });
    const res = await route(new Request(`${APP_URL}/api/v1/thing`));
    expect(await res.text()).toBe('raw');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});

describe('apiRoute auth', () => {
  it("runs the 'user' guard and gives the handler the user", async () => {
    vi.mocked(requireUser).mockResolvedValue(user);
    const route = apiRoute({ auth: 'user', handler: async (ctx) => ({ id: ctx.user?.id }) });
    const res = await route(new Request(`${APP_URL}/api/v1/me`));
    expect(await res.json()).toEqual({ id: user.id });
  });

  it('returns the guard error (401) without calling the handler', async () => {
    vi.mocked(requireUser).mockRejectedValue(unauthorized());
    const handler = vi.fn(async () => ({ ok: true }));
    const res = await apiRoute({ auth: 'user', handler })(new Request(`${APP_URL}/api/v1/me`));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("gives a 'host' handler the host context's user", async () => {
    vi.mocked(requireHost).mockResolvedValue({ user, orgId: 'org-1', role: 'owner' });
    const route = apiRoute({
      auth: 'host',
      handler: async (ctx) => ({ id: ctx.user?.id, orgId: ctx.host?.orgId }),
    });
    const res = await route(new Request(`${APP_URL}/api/v1/host/thing`));
    expect(await res.json()).toEqual({ id: user.id, orgId: 'org-1' });
  });

  it("gives an 'none' handler no user and runs no guard", async () => {
    const route = apiRoute({ handler: async (ctx) => ({ user: ctx.user }) });
    const res = await route(new Request(`${APP_URL}/api/v1/thing`));
    expect(await res.json()).toEqual({ user: null });
    expect(requireUser).not.toHaveBeenCalled();
  });
});

describe('apiRoute rate limit', () => {
  it('returns 429 rate_limited with Retry-After once the key is over its limit', async () => {
    vi.mocked(requireUser).mockResolvedValue(user);
    const handler = vi.fn(async () => ({ ok: true }));
    const route = apiRoute({
      auth: 'user',
      rateLimit: { key: (ctx) => `api-test:${ctx.user?.id}`, limit: 2, windowSec: 3600 },
      handler,
    });
    const call = () => route(new Request(`${APP_URL}/api/v1/limited`));

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as ErrorBody).error.code).toBe('rate_limited');
    const retryAfter = Number(blocked.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/v1/health', () => {
  it('returns ok and the app environment', async () => {
    const res = await health(new Request(`${APP_URL}/api/v1/health`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, env: 'dev' });
  });
});
