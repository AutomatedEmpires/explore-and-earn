import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { forbidden } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { asUser, call, request, seedUser, setupRouteDb } from '@tests/helpers/sp4';

const recentAuth = vi.hoisted(() => ({ fn: vi.fn(async (): Promise<void> => {}) }));
const fakes = vi.hoisted(() => ({
  storage: undefined as import('@/modules/media').MemoryStorage | undefined,
  clerk: undefined as import('@/modules/identity').FakeClerkAdmin | undefined,
}));

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => ({
  ...(await import('@tests/helpers/sp4')).guardMocks(),
  requireRecentAuth: () => recentAuth.fn(),
}));
vi.mock('@/modules/jobs', async (orig) => ({
  ...(await orig<typeof import('@/modules/jobs')>()),
  kickWorker: vi.fn(),
}));
vi.mock('@/modules/media', async (orig) => ({
  ...(await orig<typeof import('@/modules/media')>()),
  getStorage: () => fakes.storage,
}));
vi.mock('@/modules/identity', async (orig) => ({
  ...(await orig<typeof import('@/modules/identity')>()),
  clerkAdmin: () => fakes.clerk,
}));

import { POST as DELETE_ACCOUNT } from '@/app/api/v1/me/privacy/deletion/route';
import { GET as DOWNLOAD } from '@/app/api/v1/me/privacy/exports/[id]/download/route';
import { POST as EXPORT } from '@/app/api/v1/me/privacy/exports/route';
import { GET as LIST } from '@/app/api/v1/me/privacy/requests/route';
import { makeFakeClerkAdmin } from '@/modules/identity';
import { kickWorker } from '@/modules/jobs';
import { memoryStorage } from '@/modules/media';

const t = setupRouteDb();

type ErrorBody = { error: { code: string; message: string; details?: Record<string, unknown> } };

beforeEach(() => {
  fakes.storage = memoryStorage();
  fakes.clerk = makeFakeClerkAdmin();
  recentAuth.fn.mockReset().mockResolvedValue(undefined);
  vi.mocked(kickWorker).mockClear();
});

async function signedInSeeker() {
  const user = await seedUser(t.db, { accountType: 'seeker' });
  asUser(user);
  return user;
}

const notReverified = () =>
  forbidden('Confirm it is you to continue', {
    reason: 'reverification_required',
    reverification: { level: 'first_factor', afterMinutes: 10 },
  });

async function seedFinishedExport(userId: string, expiresAt: string): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.privacy_requests
      (id, user_id, kind, status, export_path, export_size_bytes, export_expires_at, completed_at)
    values (${id}, ${userId}, 'export', 'completed', ${`${id}.zip`}, 3,
      ${expiresAt}::timestamptz, now())
  `);
  await fakes.storage?.write('privacy-exports', `${id}.zip`, new Uint8Array([1, 2, 3]), 'application/zip');
  return id;
}

describe('POST /api/v1/me/privacy/exports', () => {
  it('asks for reverification first, with the hint Clerk reads', async () => {
    await signedInSeeker();
    recentAuth.fn.mockRejectedValue(notReverified());
    const res = await call(EXPORT, request('POST', '/api/v1/me/privacy/exports'));
    expect(res.status).toBe(403);
    const body = res.body as ErrorBody & { clerk_error?: unknown };
    expect(body.error.details?.reason).toBe('reverification_required');
    expect(body.clerk_error).toBeDefined();
    expect(kickWorker).not.toHaveBeenCalled();
  });

  it('starts an export, kicks the worker, and answers 409 while it is open', async () => {
    const user = await signedInSeeker();
    const res = await call(EXPORT, request('POST', '/api/v1/me/privacy/exports'));
    expect(res.status).toBe(200);
    const body = res.body as { requestId: string; status: string };
    expect(body.status).toBe('running');
    expect(kickWorker).toHaveBeenCalledTimes(1);

    const again = await call(EXPORT, request('POST', '/api/v1/me/privacy/exports'));
    expect(again.status).toBe(409);
    expect((again.body as ErrorBody).error.details?.reason).toBe('export_open');

    const list = await call(LIST, request('GET', '/api/v1/me/privacy/requests'));
    expect(list.status).toBe(200);
    expect(list.body).toEqual({
      items: [
        {
          id: body.requestId,
          kind: 'export',
          status: 'running',
          createdAt: expect.any(String) as string,
          completedAt: null,
          exportExpiresAt: null,
        },
      ],
    });
    const rows = await queryRows(
      t.db,
      sql`select 1 from app.privacy_requests where user_id = ${user.id}`,
    );
    expect(rows).toHaveLength(1);
  });

  it('needs a signed-in user', async () => {
    const { guardMocks } = await import('@tests/helpers/sp4');
    guardMocks().requireUser.mockRejectedValueOnce(
      (await import('@/lib/errors')).unauthorized('Sign in required'),
    );
    const res = await call(EXPORT, request('POST', '/api/v1/me/privacy/exports'));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/me/privacy/exports/{id}/download', () => {
  it('redirects the owner to a 300-second signed URL and audits the download', async () => {
    const user = await signedInSeeker();
    const id = await seedFinishedExport(user.id, '2099-01-01T00:00:00Z');
    const res = await call(DOWNLOAD, request('GET', `/api/v1/me/privacy/exports/${id}/download`), {
      id,
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`memory://privacy-exports/${id}.zip?expiresIn=300`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const audit = await queryRows(
      t.db,
      sql`select 1 from app.audit_events
          where action = 'privacy.export_downloaded' and subject_id = ${id}`,
    );
    expect(audit).toHaveLength(1);
  });

  it("answers 404 for someone else's export", async () => {
    const owner = await seedUser(t.db, { accountType: 'seeker' });
    const id = await seedFinishedExport(owner.id, '2099-01-01T00:00:00Z');
    await signedInSeeker();
    const res = await call(DOWNLOAD, request('GET', `/api/v1/me/privacy/exports/${id}/download`), {
      id,
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
  });

  it('answers 410 with the envelope once the download has expired', async () => {
    const user = await signedInSeeker();
    const id = await seedFinishedExport(user.id, '2020-01-01T00:00:00Z');
    const res = await call(DOWNLOAD, request('GET', `/api/v1/me/privacy/exports/${id}/download`), {
      id,
    });
    expect(res.status).toBe(410);
    expect((res.body as ErrorBody).error).toMatchObject({
      code: 'gone',
      message: 'This download has expired. Request a new one from your privacy settings.',
    });
  });
});

describe('POST /api/v1/me/privacy/deletion', () => {
  it('needs the word DELETE exactly', async () => {
    await signedInSeeker();
    for (const body of [{ confirm: 'delete' }, {}]) {
      const res = await call(
        DELETE_ACCOUNT,
        request('POST', '/api/v1/me/privacy/deletion', { body }),
      );
      expect(res.status).toBe(400);
    }
    expect(recentAuth.fn).not.toHaveBeenCalled();
  });

  it('asks for reverification, then starts the deletion and signs the person out', async () => {
    const user = await signedInSeeker();
    recentAuth.fn.mockRejectedValueOnce(notReverified());
    const refused = await call(
      DELETE_ACCOUNT,
      request('POST', '/api/v1/me/privacy/deletion', { body: { confirm: 'DELETE' } }),
    );
    expect(refused.status).toBe(403);
    expect(
      await queryRows(t.db, sql`select 1 from app.privacy_requests where user_id = ${user.id}`),
    ).toEqual([]);

    const res = await call(
      DELETE_ACCOUNT,
      request('POST', '/api/v1/me/privacy/deletion', { body: { confirm: 'DELETE' } }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requestId: expect.any(String) as string, status: 'running' });
    expect(fakes.clerk?.banned.has(user.clerkUserId)).toBe(true);
    expect(kickWorker).toHaveBeenCalledTimes(1);
  });
});
