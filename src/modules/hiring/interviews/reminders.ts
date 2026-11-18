// A queued reminder sends only while the interview is still scheduled at that sequence.
import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { interviews, pipelineEntries } from '../schema';
import { notifyInterview, scheduleFields } from './deliver';

export async function sendInterviewReminder(db: Db, payload: unknown, _now = new Date()): Promise<void> {
  if (!payload || typeof payload !== 'object') return;
  const body = payload as { interviewId?: unknown; sequence?: unknown; which?: unknown };
  if (typeof body.interviewId !== 'string' || typeof body.sequence !== 'number') return;
  if (body.which !== '24h' && body.which !== '1h') return;
  const [row] = await db
    .select({ interview: interviews, seekerUserId: pipelineEntries.seekerUserId })
    .from(interviews)
    .innerJoin(pipelineEntries, eq(interviews.applicationId, pipelineEntries.applicationId))
    .where(eq(interviews.id, body.interviewId));
  if (!row || row.interview.status !== 'scheduled' || row.interview.sequence !== body.sequence) return;
  const type = body.which === '24h' ? 'hiring.interview_reminder_24h' : 'hiring.interview_reminder_1h';
  await notifyInterview(
    db,
    row.interview,
    row.seekerUserId,
    [
      { userId: row.seekerUserId, audience: 'seeker' },
      { userId: row.interview.organizerUserId, audience: 'host' },
    ],
    type,
    { icsMethod: 'REQUEST', ...scheduleFields(row.interview) },
  );
}
