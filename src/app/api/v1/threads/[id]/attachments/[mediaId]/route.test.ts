import { describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import { sendMessage } from '@/modules/messaging';
// Seed helpers sit beside the messaging tests and are not part of the public API.
// eslint-disable-next-line no-restricted-imports
import {
  GATE_REFUSAL,
  GATED_STATUSES,
  seedAttachment,
  seedThread,
  seekerViewer,
  setVerification,
} from '@/modules/messaging/test-fixtures';
import { asHost, asSeeker, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { GET } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const t = setupRouteDb();

describe('GET /threads/:id/attachments/:mediaId', () => {
  it('redirects a participant to a signed url and hides a file that is not on the thread', async () => {
    const seeded = await seedThread(t.db);
    const mediaId = await seedAttachment(t.db, {
      ownerUserId: seeded.seekerId,
      mime: 'application/pdf',
    });
    await sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
      clientId: newId(),
      body: 'Attached',
      attachmentMediaIds: [mediaId],
    });
    asSeeker(seeded.seeker);
    const ok = await call(
      GET,
      request('GET', `/api/v1/threads/${seeded.threadId}/attachments/${mediaId}`),
      { id: seeded.threadId, mediaId },
    );
    expect(ok.status).toBe(302);
    expect(ok.headers.get('location')).toContain(mediaId);

    const missing = newId();
    const denied = await call(
      GET,
      request('GET', `/api/v1/threads/${seeded.threadId}/attachments/${missing}`),
      { id: seeded.threadId, mediaId: missing },
    );
    expect(denied.status).toBe(404);
  });
});

// A host the applicant verification gate refuses opens no applicant file, with the applicant
// list's 409 (issue 199).
describe('GET /threads/:id/attachments/:mediaId and the verified-host gate', () => {
  async function attached() {
    const seeded = await seedThread(t.db);
    const mediaId = await seedAttachment(t.db, { ownerUserId: seeded.seekerId });
    await sendMessage(t.db, seekerViewer(seeded.seekerId), seeded.threadId, {
      clientId: newId(),
      body: 'My resume',
      attachmentMediaIds: [mediaId],
    });
    return { seeded, mediaId };
  }

  it('redirects a verified host', async () => {
    const { seeded, mediaId } = await attached();
    asHost(seeded.owner);
    const res = await call(
      GET,
      request('GET', `/api/v1/threads/${seeded.threadId}/attachments/${mediaId}`),
      { id: seeded.threadId, mediaId },
    );
    expect(res.status).toBe(302);
  });

  it.each(GATED_STATUSES)(
    'refuses a host whose verification is %s with the applicant list 409',
    async (status) => {
      const { seeded, mediaId } = await attached();
      await setVerification(t.db, seeded.orgId, status);
      asHost(seeded.owner);
      const res = await call(
        GET,
        request('GET', `/api/v1/threads/${seeded.threadId}/attachments/${mediaId}`),
        { id: seeded.threadId, mediaId },
      );
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: {
          message: GATE_REFUSAL[status],
          details: { reason: `verification_${status}` },
        },
      });
      expect(res.headers.get('location')).toBeNull();
    },
  );
});
