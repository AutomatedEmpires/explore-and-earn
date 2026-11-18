// eslint-disable-next-line no-restricted-imports
import { defineType } from '@/modules/notifications/types';

defineType({
  type: 'support.reply',
  category: 'account',
  mandatory: true,
  title: (d) => `Reply to your support ticket #${String(d.number)}`,
  body: (d) => (typeof d.body === 'string' ? d.body.slice(0, 200) : ''),
  url: (d) => (typeof d.ticketId === 'string' ? `/help/tickets/${d.ticketId}` : null),
  email: {
    template: 'SupportReply',
    replyTo: (d) => (typeof d.replyTo === 'string' ? d.replyTo : null),
  },
  push: true,
});
