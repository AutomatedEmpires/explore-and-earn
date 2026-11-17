// The new-message notification. The title names the org or the person, never the body.
import type { NotificationData } from '@/modules/notifications';
import { defineType } from '@/modules/notifications';

function text(d: NotificationData, key: string): string {
  const value = d[key];
  return typeof value === 'string' ? value : '';
}

defineType({
  type: 'messages.new',
  category: 'messages',
  push: true,
  title: (d) =>
    d.audience === 'host'
      ? `New message from ${text(d, 'firstName')}`
      : `New message from ${text(d, 'orgName')}`,
  body: () => 'Open the conversation to read it.',
  url: (d) => {
    const id = text(d, 'threadId');
    return d.audience === 'host' ? `/host/messages/${id}` : `/inbox/${id}`;
  },
  email: {
    template: 'Digest',
    batch: { key: 'messages', delayMinutes: 15 },
    digestAction: 'Reply in app',
  },
});
