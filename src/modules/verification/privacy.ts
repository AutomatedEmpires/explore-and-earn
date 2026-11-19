// Privacy hooks for SP8's exporter and eraser (SP2 spec section 10). Verification rows belong to
// the organization, not to a person: no column names a user, and the signals keep only the
// owner's email domain. Org data is retained under SP8's retention rules, so there is nothing to
// export or erase per user.
import { eq, max } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { EraseResult, PrivacyHandler, RetentionRule } from '@/modules/privacy';
import { businessVerifications } from './schema';

export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export() {
    return {};
  },
  async erase() {},
};

const KEEP_MONTHS = 12;

export const privacyHandler: PrivacyHandler = {
  module: 'verification',
  // The fingerprint and brand-contact lists carry no user or organization id: they are fraud
  // signals and reference data, so no subject's erasure reaches them.
  tables: [
    'business_verifications',
    'verification_banned_fingerprints',
    'verification_brand_contacts',
  ],

  async exportData() {
    return { records: {}, files: [] };
  },

  async erase(tx, s, ctx): Promise<EraseResult> {
    if (s.kind !== 'org') return { erased: 0, retained: [] };
    const [row] = await tx
      .select({ newest: max(businessVerifications.createdAt) })
      .from(businessVerifications)
      .where(eq(businessVerifications.orgId, s.orgId));
    if (!row?.newest) return { erased: 0, retained: [] };
    if (ctx.holds.includes('all')) {
      return {
        erased: 0,
        retained: [{ table: 'business_verifications', reason: 'legal_hold', until: null }],
      };
    }
    // How a business was checked is a safety record: kept 12 months after the last check.
    const until = new Date(row.newest.getTime());
    until.setUTCMonth(until.getUTCMonth() + KEEP_MONTHS);
    return {
      erased: 0,
      retained: [
        {
          table: 'business_verifications',
          reason: 'safety',
          until: until.toISOString().slice(0, 10),
        },
      ],
    };
  },
};
export const retentionRules: RetentionRule[] = [];
