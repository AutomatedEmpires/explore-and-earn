import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asSeeker, call, request, seedUser, setupRouteDb } from '@tests/helpers/sp4';
import { PUT } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const t = setupRouteDb();

describe('/api/v1/me/profile/skills', () => {
  beforeEach(async () => {
    asSeeker(await seedUser(t.db, { accountType: 'seeker' }));
  });

  it('stores one skill when the labels normalize to the same key', async () => {
    const res = await call(
      PUT,
      request('PUT', '/api/v1/me/profile/skills', {
        body: {
          skills: [
            { label: 'Deckhand', highlighted: true },
            { label: 'deckhand ', highlighted: false },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      skills: [{ label: 'Deckhand', key: 'deckhand', highlighted: true }],
    });
  });
});
