import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asUser, call, request, seedUser, useRouteDb } from '@tests/helpers/sp4';
import { GET, PUT } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const t = useRouteDb();
const PATH = '/api/v1/me/notification-preferences';

type Items = { items: { category: string; channel: string; enabled: boolean; locked: boolean }[] };

describe('/api/v1/me/notification-preferences', () => {
  beforeEach(async () => {
    asUser(await seedUser(t.db, { accountType: 'seeker' }));
  });

  it('lists 16 rows', async () => {
    const res = await call(GET, request('GET', PATH));
    expect(res.status).toBe(200);
    expect((res.body as Items).items).toHaveLength(16);
  });

  it('turns a switch off and returns the rows', async () => {
    const res = await call(
      PUT,
      request('PUT', PATH, { body: { category: 'jobs', channel: 'push', enabled: false } }),
    );
    expect(res.status).toBe(200);
    const row = (res.body as Items).items.find(
      (r) => r.category === 'jobs' && r.channel === 'push',
    );
    expect(row?.enabled).toBe(false);
  });

  it('refuses a locked category with 400', async () => {
    const res = await call(
      PUT,
      request('PUT', PATH, { body: { category: 'billing', channel: 'push', enabled: false } }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: 'bad_request', details: { reason: 'locked' } },
    });
  });

  it('refuses the operator category as invalid input', async () => {
    const res = await call(
      PUT,
      request('PUT', PATH, { body: { category: 'operator', channel: 'email', enabled: false } }),
    );
    expect(res.status).toBe(400);
  });
});
