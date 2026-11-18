// Privacy hooks for SP8's exporter and eraser (SP2 spec section 10). Verification rows belong to
// the organization, not to a person: no column names a user, and the signals keep only the
// owner's email domain. Org data is retained under SP8's retention rules, so there is nothing to
// export or erase per user.
import type { DbOrTx } from '@/lib/db';
import { stubPrivacyHandler, type RetentionRule } from '@/modules/privacy';

export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export() {
    return {};
  },
  async erase() {},
};

export const privacyHandler = stubPrivacyHandler('verification', ['business_verifications']);
export const retentionRules: RetentionRule[] = [];
