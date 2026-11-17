import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asSeeker, call, request, seedUser, setupRouteDb } from '@tests/helpers/sp4';
import { PUT } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const t = setupRouteDb();

describe('/api/v1/me/availability', () => {
  beforeEach(async () => {
    asSeeker(await seedUser(t.db, { accountType: 'seeker' }));
  });

  it('stores now as the client\'s today', async () => {
    const clientToday = new Date().toISOString().slice(0, 10);
    const res = await call(
      PUT,
      request('PUT', '/api/v1/me/availability', {
        body: { preset: 'now', clientToday },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ preset: 'now', date: clientToday });
  });
});
