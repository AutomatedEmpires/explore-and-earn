// Hiring notification types. Titles never contain a note or a message body.
import type { NotificationData } from '@/modules/notifications';
import { defineType } from '@/modules/notifications';
import { interviewIcsAttachments } from './interviews/ics';

function text(d: NotificationData, key: string): string {
  const value = d[key];
  return typeof value === 'string' ? value : '';
}

const openIt = () => 'Open Explore&Earn to see it.';

defineType({
  type: 'hiring.invite_received',
  category: 'applications',
  push: true,
  title: (d) => `${text(d, 'orgName')} invited you to apply`,
  body: openIt,
  email: { template: 'HiringUpdate' },
});

defineType({
  type: 'hiring.invite_expiring',
  category: 'applications',
  title: (d) => `Your invite from ${text(d, 'orgName')} expires in 2 days`,
  body: openIt,
  email: { template: 'HiringUpdate' },
});

defineType({
  type: 'hiring.invite_response',
  category: 'applications',
  push: true,
  title: (d) =>
    d.interested === false ? `${text(d, 'firstName')} isn't interested` : `${text(d, 'firstName')} is interested`,
  body: openIt,
  email: { template: 'Digest', batch: { key: 'invites', delayMinutes: 60 } },
});

for (const type of [
  'hiring.interview_invited',
  'hiring.interview_scheduled',
  'hiring.interview_times_requested',
  'hiring.interview_declined',
  'hiring.interview_canceled',
  'hiring.interview_reminder_24h',
] as const) {
  const title: Record<(typeof type), (d: NotificationData) => string> = {
    'hiring.interview_invited': (d) => `${text(d, 'orgName')} invited you to an interview`,
    'hiring.interview_scheduled': (d) => `Interview scheduled: ${text(d, 'position')}`,
    'hiring.interview_times_requested': (d) => `${text(d, 'firstName')} asked for new interview times`,
    'hiring.interview_declined': (d) => `${text(d, 'firstName')} declined the interview`,
    'hiring.interview_canceled': (d) => `Interview canceled: ${text(d, 'position')}`,
    'hiring.interview_reminder_24h': (d) => `Interview tomorrow: ${text(d, 'position')}`,
  };
  defineType({
    type,
    category: 'applications',
    push: true,
    title: title[type],
    body: openIt,
    email: { template: 'HiringUpdate', attachments: interviewIcsAttachments },
  });
}

defineType({
  type: 'hiring.interview_expired',
  category: 'applications',
  title: (d) => `Interview invite expired: ${text(d, 'position')}`,
  body: openIt,
});

defineType({
  type: 'hiring.interview_reminder_1h',
  category: 'applications',
  push: true,
  title: (d) => `Interview in 1 hour: ${text(d, 'position')}`,
  body: openIt,
});

defineType({
  type: 'hiring.interview_outcome_due',
  category: 'applications',
  title: (d) => `How did the interview with ${text(d, 'firstName')} go?`,
  body: openIt,
});

defineType({
  type: 'hiring.offer_received',
  category: 'applications',
  push: true,
  title: (d) => `${text(d, 'orgName')} sent you an offer`,
  body: openIt,
  email: { template: 'HiringUpdate' },
});

defineType({
  type: 'hiring.offer_response',
  category: 'applications',
  push: true,
  title: (d) =>
    d.accepted === false
      ? `${text(d, 'firstName')} declined your offer`
      : `${text(d, 'firstName')} accepted your offer`,
  body: openIt,
  email: { template: 'HiringUpdate' },
});

// The seeker's notice when an offer closes without the host canceling it (issue 212: the host
// failed verification). Neutral: it never says why.
defineType({
  type: 'hiring.offer_canceled',
  category: 'applications',
  push: true,
  title: (d) => `Offer canceled: ${text(d, 'position')}`,
  body: openIt,
  email: { template: 'HiringUpdate' },
});

defineType({
  type: 'hiring.marked_hired',
  category: 'applications',
  push: true,
  title: (d) => `${text(d, 'orgName')} marked you as hired`,
  body: openIt,
  email: { template: 'HiringUpdate' },
});

defineType({
  type: 'hiring.as_described_prompt',
  category: 'applications',
  push: true,
  title: (d) => `Was ${text(d, 'position')} as described?`,
  body: openIt,
  email: { template: 'HiringUpdate' },
});
