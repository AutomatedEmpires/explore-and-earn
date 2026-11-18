import { describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import { sendMessage } from '@/modules/messaging';
// Seed helpers sit beside the messaging tests and are not part of the public API.
// eslint-disable-next-line no-restricted-imports
import { seedAttachment, seedThread, seekerViewer } from '@/modules/messaging/test-fixtures';
import { asSeeker, call, request, setupRouteDb } from '@tests/helpers/sp4';
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
