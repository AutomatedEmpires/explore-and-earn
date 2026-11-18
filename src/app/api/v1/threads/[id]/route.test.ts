import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { postCard } from '@/modules/messaging';
// Seed helpers sit beside the messaging tests and are not part of the public API.
// eslint-disable-next-line no-restricted-imports
import { seedThread } from '@/modules/messaging/test-fixture';
import { asSeeker, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { GET } from './route';

const getCardPayloads = vi.hoisted(() => vi.fn(async () => [{ refId: 'card', status: 'applied' }]));

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/modules/hiring', async (orig) => ({
  ...(await orig<typeof import('@/modules/hiring')>()),
  getCardPayloads,
}));

const t = setupRouteDb();

describe('GET /threads/:id', () => {
  beforeEach(() => {
    getCardPayloads.mockClear();
    getCardPayloads.mockResolvedValue([{ refId: 'card', status: 'applied' }]);
  });

  it('includes the cards getCardPayloads returns', async () => {
    const seeded = await seedThread(t.db);
    const refId = newId();
    await withTx(t.db, (tx) => postCard(tx, seeded.threadId, { type: 'application', refId }, null));
    asSeeker(seeded.seeker);
    const res = await call(GET, request('GET', `/api/v1/threads/${seeded.threadId}`), {
      id: seeded.threadId,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cards: [{ refId: 'card', status: 'applied' }] });
    expect(getCardPayloads).toHaveBeenCalled();
  });
});
