// The audit log is append-only and kept permanently (product spec section 20). It holds ids,
// counts and enum values, never the erased values themselves, so erasure never touches it.
import type { PrivacyHandler } from '@/modules/privacy';

export const privacyHandler: PrivacyHandler = {
  module: 'audit',
  tables: ['audit_events'],
  async exportData() {
    return { records: {}, files: [] };
  },
  async erase() {
    return { erased: 0, retained: [{ table: 'audit_events', reason: 'audit', until: null }] };
  },
};
