// The worker endpoint. Supabase Cron POSTs here every minute (through pg_net), and the app
// kicks it after commits (`kickWorker`). Both carry the shared `x-jobs-secret` header.
import { createHash, timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { enqueueDueSchedules, runWorker } from '@/modules/jobs';
import { handlers } from '@/server/job-handlers';

export const maxDuration = 60;

/** Constant-time comparison; hashing first makes the lengths equal. */
function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
  const requestId = newId();
  const headers = { 'x-request-id': requestId, 'cache-control': 'no-store' };

  if (!secretMatches(req.headers.get('x-jobs-secret'), getEnv().JOBS_SECRET)) {
    return Response.json(
      { error: { code: 'unauthorized', message: 'Invalid jobs secret', requestId } },
      { status: 401, headers },
    );
  }

  try {
    const db = getDb();
    const scheduled = await enqueueDueSchedules(db, new Date());
    const counts = await runWorker(db, { handlers });
    return Response.json({ scheduled, ...counts }, { headers });
  } catch (err) {
    logger.error('jobs run failed', { requestId, error: err });
    return Response.json(
      { error: { code: 'internal', message: 'Internal error', requestId } },
      { status: 500, headers },
    );
  }
}
