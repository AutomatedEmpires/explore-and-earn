// Drizzle definitions of drizzle/3300_safety.sql (SP4 spec 4.4, W5 Task 24). The DDL holds the
// CHECKs and indexes; these mirror its columns for typed queries. Only the safety module reads
// or writes these tables; other code goes through `@/modules/safety`.
import { pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { PARTY_TYPES, REPORT_SUBJECT_TYPES, SAFETY_REPORT_REASONS } from '@/lib/safety/constants';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const reports = app.table('reports', {
  id: uuid('id').primaryKey(),
  /** References app.users(id). Null once the reporter's account is erased. */
  reporterUserId: uuid('reporter_user_id'),
  /** References app.organizations(id): the org a host member reported for. */
  reporterOrgId: uuid('reporter_org_id'),
  subjectType: text('subject_type', { enum: REPORT_SUBJECT_TYPES }).notNull(),
  /** A plain uuid: the module that registered the subject type owns it. */
  subjectId: uuid('subject_id').notNull(),
  reason: text('reason', { enum: SAFETY_REPORT_REASONS }).notNull(),
  details: text('details').notNull().default(''),
  /** The app.review_items row the report opened. */
  reviewItemId: uuid('review_item_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const blocks = app.table('blocks', {
  id: uuid('id').primaryKey(),
  blockerType: text('blocker_type', { enum: PARTY_TYPES }).notNull(),
  blockerId: uuid('blocker_id').notNull(),
  blockedType: text('blocked_type', { enum: PARTY_TYPES }).notNull(),
  blockedId: uuid('blocked_id').notNull(),
  /** References app.users(id): the seeker, or the host member acting for the org. */
  createdBy: uuid('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const mutes = app.table(
  'mutes',
  {
    /** References app.users(id). */
    seekerUserId: uuid('seeker_user_id').notNull(),
    /** References app.organizations(id). */
    orgId: uuid('org_id').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.seekerUserId, t.orgId] })],
);

export type ReportRow = typeof reports.$inferSelect;
export type BlockRecord = typeof blocks.$inferSelect;
export type MuteRow = typeof mutes.$inferSelect;
