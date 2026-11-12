// Drizzle definitions of drizzle/3200_applications.sql (SP4 spec 4.3, W4 Task 19). The DDL holds
// the CHECKs and the guard triggers; these mirror its columns for typed queries. Only the
// applications module reads or writes these tables; other code goes through
// `@/modules/applications`.
import { boolean, jsonb, pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { APPLICATION_STATUSES, WITHDRAW_REASONS } from '@/lib/applications/constants';
import type { ApplicationSnapshotV1 } from '@/lib/applications/types';
import { DISCOVERY_SOURCES } from '@/lib/discovery/types';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const applications = app.table('applications', {
  id: uuid('id').primaryKey(),
  /** A plain uuid: SP2 owns listings. */
  listingId: uuid('listing_id').notNull(),
  listingRevisionId: uuid('listing_revision_id').notNull(),
  /** References app.organizations(id). */
  orgId: uuid('org_id').notNull(),
  /** References app.users(id). */
  seekerUserId: uuid('seeker_user_id').notNull(),
  status: text('status', { enum: APPLICATION_STATUSES }).notNull().default('new'),
  source: text('source', { enum: DISCOVERY_SOURCES }).notNull(),
  inviteId: uuid('invite_id'),
  /** Frozen at submit; only privacy erasure may redact it. */
  snapshot: jsonb('snapshot').$type<ApplicationSnapshotV1>().notNull(),
  snapshotVersion: smallint('snapshot_version').notNull().default(1),
  sponsorshipMismatch: boolean('sponsorship_mismatch').notNull().default(false),
  additionalStepCompletedAt: ts('additional_step_completed_at'),
  withdrawnReason: text('withdrawn_reason', { enum: WITHDRAW_REASONS }),
  submittedAt: ts('submitted_at').notNull().defaultNow(),
  statusChangedAt: ts('status_changed_at').notNull().defaultNow(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const applicationEvents = app.table('application_events', {
  id: uuid('id').primaryKey(),
  applicationId: uuid('application_id').notNull(),
  type: text('type', {
    enum: ['submitted', 'status_changed', 'withdrawn', 'additional_step_changed'],
  }).notNull(),
  fromStatus: text('from_status', { enum: APPLICATION_STATUSES }),
  toStatus: text('to_status', { enum: APPLICATION_STATUSES }).notNull(),
  actorType: text('actor_type', { enum: ['seeker', 'host', 'system'] }).notNull(),
  actorUserId: uuid('actor_user_id'),
  /** Host-internal, or the seeker's withdraw note. Never returned to the seeker. */
  note: text('note'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationEventRow = typeof applicationEvents.$inferSelect;
