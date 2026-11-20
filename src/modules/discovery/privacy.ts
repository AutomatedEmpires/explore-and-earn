// A seeker's discovery data for export and erasure, and the SP8 registration (SP3 spec 10;
// SP8 section 3). W0 stub: W3 replaces it (Task 26). The handler's table list and the retention
// rule's key and description are final; the rule deletes nothing until then, so SP8's daily
// sweep never fails on it.
import type { Db, DbOrTx } from '@/lib/db';
import type { DiscoveryExport } from '@/lib/discovery';
import type { PrivacyHandler, RetentionRule } from '@/modules/privacy';

export async function exportUserData(_db: DbOrTx, _userId: string): Promise<DiscoveryExport> {
  throw new Error('not implemented: exportUserData');
}

export async function eraseUserData(_db: Db, _userId: string): Promise<void> {
  throw new Error('not implemented: eraseUserData');
}

export const privacyHandler: PrivacyHandler = {
  module: 'discovery',
  tables: [
    'discovery_listings',
    'discovery_sync_state',
    'listing_dispositions',
    'listing_events',
    'listing_event_daily',
    'saved_searches',
    'saved_search_matches',
    'alert_settings',
  ],
  async exportData() {
    throw new Error('not implemented: discovery privacyHandler.exportData');
  },
  async erase() {
    throw new Error('not implemented: discovery privacyHandler.erase');
  },
};

export const retentionRules: RetentionRule[] = [
  {
    key: 'discovery.listing_events_raw',
    description:
      'Raw listing events (views, saves, shares and applies) are deleted after 90 days. Daily counts are kept.',
    async run() {
      return { deleted: 0 };
    },
  },
];
