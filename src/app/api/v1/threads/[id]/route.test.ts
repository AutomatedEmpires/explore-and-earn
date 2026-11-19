// GET /api/v1/threads/{id}. A host the applicant verification gate refuses reads no thread, with
// the applicant list's 409. Its applicant keeps reading their own messages, in a thread that is
// read-only and reads `unavailable`, which never names verification (issue 199).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { postCard, sendMessage } from '@/modules/messaging';
// Seed helpers sit beside the messaging tests and are not part of the public API.
// eslint-disable-next-line no-restricted-imports
import {
  GATE_REFUSAL,
  GATED_STATUSES,
  seedThread,
  seekerViewer,
  setVerification,
} from '@/modules/messaging/test-fixtures';
import { asHost, asSeeker, call, request, setupRouteDb } from '@tests/helpers/sp4';
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

  it('opens the thread to a verified host', async () => {
    const seeded = await seedThread(t.db);
    asHost(seeded.owner);
    const res = await call(GET, request('GET', `/api/v1/threads/${seeded.threadId}`), {
      id: seeded.threadId,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      thread: { id: seeded.threadId },
      readOnly: null,
      canSend: true,
    });
  });

  it.each(GATED_STATUSES)(
    'refuses a host whose verification is %s with the applicant list 409, before any card',
    async (status) => {
      const seeded = await seedThread(t.db);
      await sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
        clientId: newId(),
        body: 'My phone is 555 0100',
      });
      await setVerification(t.db, seeded.orgId, status);
      asHost(seeded.owner);
      const res = await call(GET, request('GET', `/api/v1/threads/${seeded.threadId}`), {
        id: seeded.threadId,
      });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: {
          code: 'conflict',
          message: GATE_REFUSAL[status],
          details: { reason: `verification_${status}` },
        },
      });
      expect(JSON.stringify(res.body)).not.toContain('555 0100');
      expect(getCardPayloads).not.toHaveBeenCalled();
    },
  );

  it.each(['unverified', 'running', 'failed'] as const)(
    'keeps the seeker reading their own messages while the host is %s, read-only and neutral',
    async (status) => {
      const seeded = await seedThread(t.db);
      await sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
        clientId: newId(),
        body: 'Is the job still open?',
      });
      await setVerification(t.db, seeded.orgId, status);
      asSeeker(seeded.seeker);
      const res = await call(GET, request('GET', `/api/v1/threads/${seeded.threadId}`), {
        id: seeded.threadId,
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        messages: [expect.objectContaining({ mine: true, body: 'Is the job still open?' })],
        readOnly: 'unavailable',
        canSend: false,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/verif/i);
    },
  );
});
