import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { RATE_LIMITS, READ_ONLY } from '@/lib/messaging';
// Seed helpers sit beside the messaging tests and are not part of the public API.
// eslint-disable-next-line no-restricted-imports
import {
  GATE_REFUSAL,
  GATED_STATUSES,
  seedAttachment,
  seedThread,
  setVerification,
} from '@/modules/messaging/test-fixtures';
import { asHost, asSeeker, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { POST } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const t = setupRouteDb();

async function stored(threadId: string): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    t.db,
    sql`select count(*)::int as n from app.messages where thread_id = ${threadId}`,
  );
  return row?.n ?? 0;
}

function send(threadId: string, body: string) {
  return call(
    POST,
    request('POST', `/api/v1/threads/${threadId}/messages`, {
      body: { clientId: newId(), body },
    }),
    { id: threadId },
  );
}

// A host the applicant verification gate refuses sends nothing, with the applicant list's 409,
// and its applicant can't write into the closed thread either (issue 199).
describe('POST /threads/:id/messages and the verified-host gate', () => {
  it('sends for a verified host', async () => {
    const seeded = await seedThread(t.db);
    asHost(seeded.owner);
    const res = await send(seeded.threadId, 'Can you start Monday?');
    expect(res.status).toBe(200);
    expect(await stored(seeded.threadId)).toBe(1);
  });

  it.each(GATED_STATUSES)(
    'refuses a host whose verification is %s with the applicant list 409, storing nothing',
    async (status) => {
      const seeded = await seedThread(t.db);
      await setVerification(t.db, seeded.orgId, status);
      asHost(seeded.owner);
      const res = await send(seeded.threadId, 'Send me your bank details');
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: {
          code: 'conflict',
          message: GATE_REFUSAL[status],
          details: { reason: `verification_${status}` },
        },
      });
      expect(await stored(seeded.threadId)).toBe(0);
    },
  );

  it.each(['unverified', 'needs_info', 'failed'] as const)(
    'answers the seeker the neutral read-only 409 while the host is %s',
    async (status) => {
      const seeded = await seedThread(t.db);
      await setVerification(t.db, seeded.orgId, status);
      asSeeker(seeded.seeker);
      const res = await send(seeded.threadId, 'Hello?');
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: { code: 'conflict', message: READ_ONLY, details: { reason: 'read_only' } },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/verif/i);
      expect(await stored(seeded.threadId)).toBe(0);
    },
  );
});

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
