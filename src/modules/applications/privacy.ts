// The applications module's SP8 registration (SP4 spec 10). W0 stub: W4 implements export and
// the redacting erase (Task 23). The table list is final.
import type { PrivacyHandler, RetentionRule } from '@/modules/privacy';

export const privacyHandler: PrivacyHandler = {
  module: 'applications',
  tables: ['applications', 'application_events'],
  async exportData() {
    throw new Error('not implemented: applications privacyHandler.exportData');
  },
  async erase() {
    throw new Error('not implemented: applications privacyHandler.erase');
  },
};

export const retentionRules: RetentionRule[] = [];
