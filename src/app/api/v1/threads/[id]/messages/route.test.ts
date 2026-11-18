import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import { RATE_LIMITS } from '@/lib/messaging';
// Seed helpers sit beside the messaging tests and are not part of the public API.
// eslint-disable-next-line no-restricted-imports
import { seedAttachment, seedThread } from '@/modules/messaging/test-fixtures';
import { asSeeker, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { POST } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const t = setupRouteDb();

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /threads/:id/messages', () => {
  it('answers 429 on the 61st message in 10 minutes', async () => {
    const seeded = await seedThread(t.db);
    asSeeker(seeded.seeker);
    let last = 0;
    // The limiter counts in fixed windows aligned to the epoch. A frozen clock in the middle of
    // the current window keeps all 61 sends in one window, however long the loop takes.
    const windowMs = RATE_LIMITS.messages.windowSec * 1000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Math.floor(Date.now() / windowMs) * windowMs + windowMs / 2);
    for (let n = 0; n < 61; n += 1) {
      const res = await call(
        POST,
        request('POST', `/api/v1/threads/${seeded.threadId}/messages`, {
          body: { clientId: newId(), body: `Message ${n}` },
        }),
        { id: seeded.threadId },
      );
      last = res.status;
      if (n < 60) expect(res.status).toBe(200);
    }
    expect(last).toBe(429);
  }, 60_000);

  it('answers 409 attachment_not_ready while the file is still scanning', async () => {
    const seeded = await seedThread(t.db);
    const mediaId = await seedAttachment(t.db, { ownerUserId: seeded.seekerId, status: 'scanning' });
    asSeeker(seeded.seeker);
    const res = await call(
      POST,
      request('POST', `/api/v1/threads/${seeded.threadId}/messages`, {
        body: { clientId: newId(), body: 'File', attachmentMediaIds: [mediaId] },
      }),
      { id: seeded.threadId },
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { details: { reason: 'attachment_not_ready' } } });
  });
});
