// W5's consent table, beside privacy's schema.ts. The DDL lives in drizzle/7250_privacy_consent.sql.
import { boolean, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const consentRecords = app.table('consent_records', {
  id: uuid('id').primaryKey(),
  consentId: text('consent_id').notNull(),
  userId: uuid('user_id'),
  country: text('country'),
  region: text('region', { enum: ['eu', 'other'] }).notNull(),
  analytics: boolean('analytics').notNull(),
  policyVersion: integer('policy_version').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
