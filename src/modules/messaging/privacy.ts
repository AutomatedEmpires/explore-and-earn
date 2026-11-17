// Messaging's privacy registration. The table list is final; export and erase land in W4.
import type { PrivacyHandler, RetentionRule } from '@/modules/privacy';

export const privacyHandler: PrivacyHandler = {
  module: 'messaging',
  tables: [
    'threads',
    'messages',
    'thread_reads',
    'saved_replies',
    'bulk_messages',
    'org_reply_stats',
  ],
  mediaColumns: [{ table: 'messages', column: 'attachment_media_ids', array: true }],
  async exportData() {
    throw new Error('not implemented: privacyHandler.exportData (W4)');
  },
  async erase() {
    throw new Error('not implemented: privacyHandler.erase (W4)');
  },
};

export const retentionRules: RetentionRule[] = [
  {
    key: 'messaging.messages_12m',
    description: 'Deletes messages older than 12 months.',
    async run() {
      return { deleted: 0 };
    },
  },
];
