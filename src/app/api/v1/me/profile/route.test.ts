import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forbidden } from '@/lib/errors';
import {
  asSeeker,
  call,
  guardMocks,
  request,
  seedUser,
  setupRouteDb,
} from '@tests/helpers/sp4';
import { GET, PATCH } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const t = setupRouteDb();

describe('/api/v1/me/profile', () => {
  beforeEach(async () => {
    asSeeker(await seedUser(t.db, { accountType: 'seeker' }));
  });

  it('refuses a host account', async () => {
    guardMocks().requireSeeker.mockRejectedValue(
      forbidden('This needs a seeker account', { reason: 'wrong_account_type' }),
    );
    const res = await call(GET, request('GET', '/api/v1/me/profile'));
    expect(res.status).toBe(403);
  });

  it('reads the empty profile and saves a name', async () => {
    const first = await call(GET, request('GET', '/api/v1/me/profile'));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ version: 0, missingItem: 'name' });
    const saved = await call(
      PATCH,
      request('PATCH', '/api/v1/me/profile', {
        body: { identity: { firstName: 'Maya', city: 'Juneau' } },
      }),
    );
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      version: 1,
      identity: { firstName: 'Maya', city: 'Juneau' },
    });
  });
});
