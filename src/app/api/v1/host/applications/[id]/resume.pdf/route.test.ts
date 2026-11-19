// GET /api/v1/host/applications/{id}/resume.pdf (SP4 plan Task 14): host authorization and the
// download audit row. The PDF is the frozen snapshot for that host's org.
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { forbidden, notFound } from '@/lib/errors';
import type { ApplicationSnapshotV1 } from '@/lib/applications';
import { NEW_HOST_DAILY_CAP, consumeNewHostDaily } from '@/modules/ratelimit';
import { mayaApplicationSnapshot } from '@tests/fixtures/sp4/snapshot';
import {
  asHost,
  call,
  request,
  seedMember,
  seedOrg,
  seedUser,
  setupRouteDb,
} from '@tests/helpers/sp4';
import { GET } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
const mocks = vi.hoisted(() => ({
  authorizeHostApplication: vi.fn(),
  getSnapshot: vi.fn(),
}));
vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  authorizeHostApplication: mocks.authorizeHostApplication,
  getSnapshot: mocks.getSnapshot,
}));

const APP_ID = '019a4a3c-0000-7000-8000-0000000e0002';
const t = setupRouteDb();

const downloads = (db: Db, orgId: string) =>
  queryRows<{ orgId: string | null; actorId: string | null }>(
    db,
    sql`select org_id::text as "orgId", actor_id::text as "actorId"
        from app.audit_events
        where action = 'applications.resume_downloaded' and org_id = ${orgId}::uuid`,
  );

beforeEach(() => {
  mocks.authorizeHostApplication.mockReset();
  mocks.getSnapshot.mockReset();
});

/** A verified org's Owner, signed in. */
async function verifiedHost() {
  const { orgId } = await seedOrg(t.db);
  await t.db.execute(sql`update app.organizations set verification_status = 'verified' where id = ${orgId}`);
  const host = await seedMember(t.db, orgId, await seedUser(t.db, { accountType: 'host' }), 'owner');
  asHost(host);
  return { orgId, host };
}

/** authorizeHostApplication and getSnapshot answering for one application of `orgId`. */
function resolvesFor(orgId: string): ApplicationSnapshotV1 {
  const snapshot: ApplicationSnapshotV1 = mayaApplicationSnapshot();
  mocks.authorizeHostApplication.mockResolvedValue({
    applicationId: APP_ID,
    listingId: snapshot.listing.id,
    orgId,
    seekerUserId: '019a4a3c-0000-7000-8000-0000000e0003',
    status: 'new',
    submittedAt: new Date('2026-01-01T00:00:00Z'),
  });
  mocks.getSnapshot.mockResolvedValue(snapshot);
  return snapshot;
}

describe('GET /api/v1/host/applications/{id}/resume.pdf', () => {
  it('returns 403 when authorization is forbidden and 404 when the application is missing', async () => {
    const { orgId } = await verifiedHost();
    const req = request('GET', `/api/v1/host/applications/${APP_ID}/resume.pdf`);
    const params = { id: APP_ID };

    mocks.authorizeHostApplication.mockRejectedValue(forbidden());
    const denied = await call(GET, req, params);
    expect(denied.status).toBe(403);

    mocks.authorizeHostApplication.mockRejectedValue(notFound());
    const missing = await call(GET, request('GET', `/api/v1/host/applications/${APP_ID}/resume.pdf`), params);
    expect(missing.status).toBe(404);
    expect(await downloads(t.db, orgId)).toEqual([]);
  });

  it.each(['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const)(
    'refuses a host whose verification is %s with 409, renders nothing and audits nothing',
    async (status) => {
      const { orgId } = await seedOrg(t.db);
      const host = await seedMember(t.db, orgId, await seedUser(t.db, { accountType: 'host' }), 'owner');
      asHost(host);
      await t.db.execute(sql`update app.organizations set verification_status = ${status} where id = ${orgId}`);
      const snapshot: ApplicationSnapshotV1 = mayaApplicationSnapshot();
      mocks.authorizeHostApplication.mockResolvedValue({
        applicationId: APP_ID,
        listingId: snapshot.listing.id,
        orgId,
        seekerUserId: '019a4a3c-0000-7000-8000-0000000e0003',
        status: 'new',
        submittedAt: new Date('2026-01-01T00:00:00Z'),
      });
      mocks.getSnapshot.mockResolvedValue(snapshot);

      const res = await call(GET, request('GET', `/api/v1/host/applications/${APP_ID}/resume.pdf`), {
        id: APP_ID,
      });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: { code: 'conflict', details: { reason: `verification_${status}` } },
      });
      expect(mocks.getSnapshot).not.toHaveBeenCalled();
      expect(await downloads(t.db, orgId)).toEqual([]);
    },
  );

  it('writes one applications.resume_downloaded audit row with the org', async () => {
    const { orgId, host } = await verifiedHost();
    resolvesFor(orgId);

    const res = await call(GET, request('GET', `/api/v1/host/applications/${APP_ID}/resume.pdf`), {
      id: APP_ID,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await downloads(t.db, orgId)).toEqual([{ orgId, actorId: host.user.id }]);
    expect(mocks.getSnapshot).toHaveBeenCalledWith(t.db, { orgId, applicationId: APP_ID });
    // A new host's download queues the silent-host check for that application.
    expect(
      await queryRows(
        t.db,
        sql`select 1 from app.outbox where dedupe_key = ${`silent-host:${orgId}:${APP_ID}`}`,
      ),
    ).toHaveLength(1);
  });

  it("refuses a new host over today's profile views with 429 before rendering or auditing", async () => {
    const { orgId } = await verifiedHost();
    resolvesFor(orgId);
    for (let i = 0; i < NEW_HOST_DAILY_CAP.profile_views; i++) {
      await consumeNewHostDaily(t.db, orgId, 'profile_views', new Date());
    }

    const res = await call(GET, request('GET', `/api/v1/host/applications/${APP_ID}/resume.pdf`), {
      id: APP_ID,
    });

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      error: { code: 'rate_limited', details: { reason: 'new_host_daily_cap' } },
    });
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
    expect(await downloads(t.db, orgId)).toEqual([]);
  });
});
