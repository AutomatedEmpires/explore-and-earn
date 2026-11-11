// The safety module's SP8 registration (SP4 spec 10). W0 stub: W5 implements export and erase
// (Task 26). The table list is final.
import type { PrivacyHandler, RetentionRule } from '@/modules/privacy';

export const privacyHandler: PrivacyHandler = {
  module: 'safety',
  tables: ['reports', 'blocks', 'mutes'],
  async exportData() {
    throw new Error('not implemented: safety privacyHandler.exportData');
  },
  async erase() {
    throw new Error('not implemented: safety privacyHandler.erase');
  },
};

export const retentionRules: RetentionRule[] = [];
