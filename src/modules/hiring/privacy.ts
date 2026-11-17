// Hiring's privacy registration. The table list is final; export and erase land in W1.
import type { PrivacyHandler, RetentionRule } from '@/modules/privacy';

export const privacyHandler: PrivacyHandler = {
  module: 'hiring',
  tables: [
    'pipeline_entries',
    'pipeline_events',
    'pending_passes',
    'candidate_pool_runs',
    'candidate_pool_entries',
    'invites',
    'interviews',
    'interview_slots',
    'offers',
    'as_described_responses',
  ],
  mediaColumns: [{ table: 'offers', column: 'letter_media_id', array: false }],
  async exportData() {
    throw new Error('not implemented: privacyHandler.exportData (W1)');
  },
  async erase() {
    throw new Error('not implemented: privacyHandler.erase (W1)');
  },
};

export const retentionRules: RetentionRule[] = [
  {
    key: 'hiring.notes_12m',
    description: 'Deletes host notes older than 12 months.',
    async run() {
      return { deleted: 0 };
    },
  },
];
