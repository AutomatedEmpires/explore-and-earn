// GET /api/v1/host/applications/{id} (SP4 spec 5): the verified-host gate (legal review 7.1).
// A host an operator moved out of verified reads no application, even one it already received.
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asHost, call, request, seedMember, seedOrg, seedUser, setupRouteDb } from '@tests/helpers/sp4';
import { GET } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
const mocks = vi.hoisted(() => ({ getHostApplication: vi.fn() }));
vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  getHostApplication: mocks.getHostApplication,
}));

const APP_ID = '019a4a3c-0000-7000-8000-0000000e0002';
const t = setupRouteDb();

beforeEach(() => {
  mocks.getHostApplication.mockReset();
  mocks.getHostApplication.mockResolvedValue({ applicationId: APP_ID });
});

async function signedInHost(status: string) {
  const { orgId } = await seedOrg(t.db);
  const host = await seedMember(t.db, orgId, await seedUser(t.db, { accountType: 'host' }), 'owner');
  await t.db.execute(sql`update app.organizations set verification_status = ${status} where id = ${orgId}`);
  asHost(host);
  return host;
}

describe('GET /api/v1/host/applications/{id}', () => {
  it('returns the application to a verified host', async () => {
    const host = await signedInHost('verified');
    const res = await call(GET, request('GET', `/api/v1/host/applications/${APP_ID}`), { id: APP_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applicationId: APP_ID });
    expect(mocks.getHostApplication).toHaveBeenCalledWith(t.db, host, APP_ID);
  });

  it.each(['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const)(
    'refuses a host whose verification is %s with 409 before reading or auditing',
    async (status) => {
      await signedInHost(status);
      const res = await call(GET, request('GET', `/api/v1/host/applications/${APP_ID}`), { id: APP_ID });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: { code: 'conflict', details: { reason: `verification_${status}` } },
      });
      expect(mocks.getHostApplication).not.toHaveBeenCalled();
    },
  );
});
