// Privacy notifications. Importing this file registers them.
// Importing the notifications barrel from here cycles through this module. The type file
// itself has no further imports.
// eslint-disable-next-line no-restricted-imports
import { defineType } from '@/modules/notifications/types';

defineType({
  type: 'privacy.export_ready',
  category: 'account',
  mandatory: true,
  title: () => 'Your data download is ready',
  body: (d) => `Download it within ${String(d.ttlDays)} days from your privacy settings.`,
  url: (d) => (typeof d.url === 'string' ? d.url : null),
  email: { template: 'PrivacyExportReady' },
  push: true,
});

defineType({
  type: 'privacy.request_delayed',
  category: 'account',
  mandatory: true,
  title: () => 'Your privacy request is taking longer',
  body: () =>
    "We hit a problem finishing your request. A person on our team is on it, and we'll email you when it's done.",
  url: (d) => (typeof d.url === 'string' ? d.url : null),
  email: { template: 'PrivacyDeletion' },
});
