// GET /api/v1/host/threads. A host the applicant verification gate refuses lists no thread,
// with the applicant list's 409 (legal review 7.1; issue 199).
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
// The applicant list's gate is not on the hiring index. Messaging repeats its copy (it never
// imports hiring), so this test holds the two equal.
// eslint-disable-next-line no-restricted-imports
import { requireApplicantReads } from '@/modules/hiring/pipeline/gate';
// Seed helpers sit beside the messaging tests and are not part of the public API.
// eslint-disable-next-line no-restricted-imports
import {
  GATE_REFUSAL,
  GATED_STATUSES,
  seedMember,
  seedThread,
  setVerification,
} from '@/modules/messaging/test-fixtures';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { GET } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const t = setupRouteDb();

describe('GET /host/threads', () => {
  it('lists for a verified owner and answers a Billing member 403 role_not_allowed', async () => {
    const seeded = await seedThread(t.db);
    asHost(seeded.owner);
    const owner = await call(GET, request('GET', '/api/v1/host/threads'));
    expect(owner.status).toBe(200);
    expect(owner.body).toMatchObject({
      items: [expect.objectContaining({ threadId: seeded.threadId })],
      nextCursor: null,
    });

    const billing = await seedMember(t.db, seeded.orgId, 'billing');
    asHost(billing.ctx);
    const denied = await call(GET, request('GET', '/api/v1/host/threads'));
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: { details: { reason: 'role_not_allowed' } } });
  });

  it.each(GATED_STATUSES)(
    'refuses a host whose verification is %s with the applicant list 409',
    async (status) => {
      const seeded = await seedThread(t.db);
      await setVerification(t.db, seeded.orgId, status);
      asHost(seeded.owner);
      const res = await call(GET, request('GET', '/api/v1/host/threads'));
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: {
          code: 'conflict',
          message: GATE_REFUSAL[status],
          details: { reason: `verification_${status}` },
        },
      });
      expect(JSON.stringify(res.body)).not.toContain(seeded.threadId);
    },
  );

  it.each(GATED_STATUSES)(
    "answers %s with the applicant list's refusal, word for word",
    async (status) => {
      const seeded = await seedThread(t.db);
      await setVerification(t.db, seeded.orgId, status);
      const list = await requireApplicantReads(t.db, seeded.orgId).then(
        () => null,
        (err: unknown) => err,
      );
      if (!(list instanceof AppError)) throw new Error('the applicant list let the host through');
      asHost(seeded.owner);
      const res = await call(GET, request('GET', '/api/v1/host/threads'));
      expect(res.status).toBe(list.status);
      expect(res.body).toMatchObject({
        error: { code: list.code, message: list.message, details: list.details },
      });
    },
  );
});
