// Analytics owns no tables. Export and erase are empty on purpose.
import type { PrivacyHandler, RetentionRule } from '@/modules/privacy';

export const privacyHandler: PrivacyHandler = {
  module: 'analytics',
  tables: [],
  async exportData() {
    return { records: {}, files: [] };
  },
  async erase() {
    return { erased: 0, retained: [] };
  },
};

export const retentionRules: RetentionRule[] = [];
