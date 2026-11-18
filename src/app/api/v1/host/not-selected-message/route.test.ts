import { describe, expect, it, vi } from 'vitest';
import { NOT_SELECTED_DEFAULT } from '@/lib/messaging';
import { seedHostOrg, seedMember } from '@tests/helpers/sp5';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { GET, PUT } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const t = setupRouteDb();

describe('not-selected message', () => {
  it('returns the default, refuses a recruiter, and lets an admin set it', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    const admin = await seedMember(t.db, org.orgId, 'admin');

    asHost(org.owner.ctx);
    const initial = await call(GET, request('GET', '/api/v1/host/not-selected-message'));
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({ body: NOT_SELECTED_DEFAULT, isDefault: true });

    asHost(recruiter.ctx);
    const denied = await call(
      PUT,
      request('PUT', '/api/v1/host/not-selected-message', { body: { body: 'Custom thanks' } }),
    );
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: { details: { reason: 'role_not_allowed' } } });

    asHost(admin.ctx);
    const saved = await call(
      PUT,
      request('PUT', '/api/v1/host/not-selected-message', { body: { body: 'Custom thanks' } }),
    );
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ body: 'Custom thanks', isDefault: false });
  });

  it('answers a Billing member 403 role_not_allowed on read and write', async () => {
    const org = await seedHostOrg(t.db);
    const billing = await seedMember(t.db, org.orgId, 'billing');
    asHost(billing.ctx);
    const read = await call(GET, request('GET', '/api/v1/host/not-selected-message'));
    expect(read.status).toBe(403);
    expect(read.body).toMatchObject({ error: { details: { reason: 'role_not_allowed' } } });
    const write = await call(
      PUT,
      request('PUT', '/api/v1/host/not-selected-message', { body: { body: 'Custom thanks' } }),
    );
    expect(write.status).toBe(403);
    expect(write.body).toMatchObject({ error: { details: { reason: 'role_not_allowed' } } });
  });
});
