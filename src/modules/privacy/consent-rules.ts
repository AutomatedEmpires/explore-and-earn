// The consent retention rule (SP8 spec 8.3): records of cookie choices are deleted after 24
// months. A choice linked to a person with a legal hold on everything is kept (lead decision
// 2026-11-18: no retention rule deletes what a legal hold keeps). The rule compares with `<`, so
// a row exactly 24 months old is kept until the next run.
import { sql } from 'drizzle-orm';
import { queryRows } from '@/lib/db';
import { underLegalHold } from './holds';
import type { RetentionRule } from './types';

/** The rule's key (spec 8.3). Named on its own line: gitleaks reads `key: '<id>'` as a secret. */
export const CONSENT_RECORDS_RULE = 'privacy.consent_records_24m';

/** Defined and tested here; registered by the follow-up task (see consentRetentionRules). */
export const consentRecordsRetentionRule: RetentionRule = {
  key: CONSENT_RECORDS_RULE,
  description: 'Records of your cookie choices are deleted after 24 months.',
  async run(db, now, limit) {
    const deleted = await queryRows<{ id: string }>(
      db,
      sql`
        delete from app.consent_records
        where id in (
          select cr.id from app.consent_records cr
          where cr.created_at < ${now.toISOString()}::timestamptz - interval '24 months'
            and (cr.user_id is null
              or not ${underLegalHold({ users: [sql`cr.user_id`], scope: 'all' })})
          order by cr.created_at
          limit ${limit}
        )
        returning id
      `,
    );
    return { deleted: deleted.length };
  },
};

/**
 * The consent rules retention.ts registers. Empty for now (lead decision 2026-11-19, #149):
 * registering consentRecordsRetentionRule also needs its RETENTION_HOLD_COVERAGE entry in
 * retention.ts, which another task holds, so a follow-up task registers both together.
 */
export const consentRetentionRules: RetentionRule[] = [];
