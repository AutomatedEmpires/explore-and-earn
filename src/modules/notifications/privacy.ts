import type { PrivacyHandler } from '@/modules/privacy';

export const privacyHandler: PrivacyHandler = {
  module: 'notifications',
  tables: [
    'notifications',
    'notification_preferences',
    'push_subscriptions',
    'email_suppressions',
    'notification_batches',
  ],
  async exportData() {
    throw new Error('not implemented: privacyHandler (W1)');
  },
  async erase() {
    throw new Error('not implemented: privacyHandler (W1)');
  },
};
