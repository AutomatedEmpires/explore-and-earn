import { describe, expect, it } from 'vitest';
import { eventSubscribers } from '@/server/event-subscribers';
import { handlers } from '@/server/job-handlers';
import { schedules } from '@/server/schedules';

const TOPICS = [
  'hiring.application_submitted',
  'hiring.application_withdrawn',
  'hiring.additional_step_changed',
  'hiring.member_removed',
  'hiring.commit_pass',
  'hiring.interview_reminder',
  'hiring.scan_note',
  'hiring.sweep',
  'hiring.fit_refresh',
  'hiring.as_described_due',
  'messaging.scan',
  'messaging.bulk_send',
  'messaging.daily',
];

describe('SP5 job registry', () => {
  it('gives every scheduled and subscribed SP5 topic a handler that accepts an empty payload', async () => {
    const scheduled = schedules.map((row) => row.topic).filter((topic) => topic.startsWith('hiring.') || topic.startsWith('messaging.'));
    const subscribed = [
      ...eventSubscribers['application.submitted'],
      ...eventSubscribers['application.withdrawn'],
      ...eventSubscribers['application.additional_step_changed'],
      ...eventSubscribers['org.member_removed'],
    ].filter((topic) => topic.startsWith('hiring.') || topic.startsWith('messaging.'));
    for (const topic of [...scheduled, ...subscribed, ...TOPICS]) {
      expect(topic.startsWith('hiring.') || topic.startsWith('messaging.')).toBe(true);
      expect(handlers[topic], topic).toBeTypeOf('function');
      const run = handlers[topic] as (payload: unknown) => Promise<void>;
      await expect(run({})).resolves.toBeUndefined();
    }
    expect(scheduled).toEqual([
      'hiring.sweep',
      'hiring.fit_refresh',
      'hiring.as_described_due',
      'messaging.daily',
    ]);
    expect(eventSubscribers['application.submitted']).toContain('hiring.application_submitted');
    expect(eventSubscribers['application.withdrawn']).toContain('hiring.application_withdrawn');
    expect(eventSubscribers['application.additional_step_changed']).toContain('hiring.additional_step_changed');
    expect(eventSubscribers['org.member_removed']).toContain('hiring.member_removed');
  });
});
