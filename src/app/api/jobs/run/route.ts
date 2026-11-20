// The worker endpoint. Supabase Cron POSTs here every minute (through pg_net), and the app
// kicks it after commits (`kickWorker`). Both carry the shared `x-jobs-secret` header.
import { createHash, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { unauthorized } from '@/lib/errors';
import { enqueueDueSchedules, runWorker } from '@/modules/jobs';
import { apiRoute } from '@/server/api';
import { handlers, onDeadEvent } from '@/server/job-handlers';
// SP2 module-load registrations, so every job sees them on a cold server.
import '@/server/sp2-wiring';

export const maxDuration = 60;

/** Constant-time comparison; hashing first makes the lengths equal. */
function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export const POST = apiRoute({
  auth: 'none',
  handler: async ({ req, db }) => {
    if (!secretMatches(req.headers.get('x-jobs-secret'), getEnv().JOBS_SECRET)) {
      throw unauthorized('Invalid jobs secret');
    }
    const scheduled = await enqueueDueSchedules(db, new Date());
    const counts = await runWorker(db, { handlers, onDead: onDeadEvent });
    return { scheduled, ...counts };
  },
});
