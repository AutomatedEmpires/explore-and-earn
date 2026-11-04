// Live unread counts for the signed-in user (spec section 4), as server-sent events:
//   event: counts
//   data: {"inbox":n,"notifications":n}
// sent at once, then every 15 seconds. The stream ends itself before the function's time limit;
// EventSource reconnects on its own, and clients that can't stream poll every 30 seconds.
import type { Db } from '@/lib/db';
import { unauthorized } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { apiRoute } from '@/server/api';
import { getCounts } from '@/server/counts';

export const maxDuration = 300;

const INTERVAL_MS = 15_000;
/** Close a little before maxDuration, so the platform never cuts the stream mid-write. */
const LIFETIME_MS = 270_000;

const encoder = new TextEncoder();

function countsStream(db: Db, userId: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  let interval: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearTimeout(lifetime);
        signal.removeEventListener('abort', stop);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      const send = async () => {
        try {
          const counts = await getCounts(db, userId);
          if (closed) return;
          controller.enqueue(encoder.encode(`event: counts\ndata: ${JSON.stringify(counts)}\n\n`));
        } catch (err) {
          // Skip this tick; the next one tries again.
          logger.warn('me/stream: counts failed', { userId, err });
        }
      };

      if (signal.aborted) return stop();
      signal.addEventListener('abort', stop);
      await send();
      interval = setInterval(() => void send(), INTERVAL_MS);
      lifetime = setTimeout(stop, LIFETIME_MS);
    },
    cancel() {
      closed = true;
      clearInterval(interval);
      clearTimeout(lifetime);
    },
  });
}

export const GET = apiRoute({
  auth: 'user',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/stream',
    summary: 'Live unread counts (text/event-stream, event "counts")',
  },
  handler: async ({ db, user, req }) => {
    if (!user) throw unauthorized();
    return new Response(countsStream(db, user.id, req.signal), {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  },
});
