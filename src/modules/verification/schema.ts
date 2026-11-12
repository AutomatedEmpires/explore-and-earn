// Drizzle tables for the verification module (created in drizzle/1400_verification.sql). Only
// this module reads or writes them; other code goes through `@/modules/verification`.
// Only tables are exported here: src/db/schema.ts re-exports every module's schema file.
import { jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { VerificationSignals } from './signals';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const BUSINESS_VERIFICATION_STATUSES = [
  'running',
  'verified',
  'needs_review',
  'needs_info',
  'failed',
] as const;

/** One verification run. `running`, `needs_review` and `needs_info` are open (one per org). */
export const businessVerifications = app.table('business_verifications', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  /** References app.listings(id); null for a re-run. */
  triggerListingId: uuid('trigger_listing_id'),
  status: text('status', { enum: BUSINESS_VERIFICATION_STATUSES }).notNull().default('running'),
  signals: jsonb('signals').$type<VerificationSignals>(),
  checkId: uuid('check_id'),
  reviewItemId: uuid('review_item_id'),
  infoRequest: text('info_request'),
  infoResponse: text('info_response'),
  infoWebsiteUrl: text('info_website_url'),
  decidedBy: text('decided_by', { enum: ['auto', 'operator'] }),
  decidedAt: ts('decided_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
