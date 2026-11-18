import { describe, expect, it, vi } from 'vitest';
import { seedHostOrg, seedMember } from '@tests/helpers/sp5';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { GET } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const t = setupRouteDb();

describe('GET /host/threads', () => {
  it('lists for the owner and answers a Billing member 403 role_not_allowed (#184)', async () => {
    const org = await seedHostOrg(t.db);
    asHost(org.owner.ctx);
    const owner = await call(GET, request('GET', '/api/v1/host/threads'));
    expect(owner.status).toBe(200);
    expect(owner.body).toEqual({ items: [], nextCursor: null });

    const billing = await seedMember(t.db, org.orgId, 'billing');
    asHost(billing.ctx);
    const denied = await call(GET, request('GET', '/api/v1/host/threads'));
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: { details: { reason: 'role_not_allowed' } } });
  });
});
