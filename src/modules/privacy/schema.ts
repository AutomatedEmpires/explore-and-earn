// Drizzle tables for the privacy module. The DDL lives in drizzle/7000_privacy.sql.
import { bigint, date, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const privacyRequests = app.table('privacy_requests', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  kind: text('kind', { enum: ['export', 'delete'] }).notNull(),
  status: text('status', {
    enum: ['pending', 'running', 'needs_action', 'completed', 'failed'],
  })
    .notNull()
    .default('pending'),
  blockedReason: text('blocked_reason', { enum: ['step_failed', 'overdue'] }),
  notifyEmail: text('notify_email'),
  exportPath: text('export_path'),
  exportSizeBytes: bigint('export_size_bytes', { mode: 'number' }),
  exportExpiresAt: ts('export_expires_at'),
  reviewItemId: uuid('review_item_id'),
  completedAt: ts('completed_at'),
  clerkUserIdPending: text('clerk_user_id_pending'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const privacyRequestSteps = app.table('privacy_request_steps', {
  id: uuid('id').primaryKey(),
  requestId: uuid('request_id').notNull(),
  subjectKind: text('subject_kind', { enum: ['user', 'org'] }).notNull(),
  subjectId: uuid('subject_id').notNull(),
  module: text('module').notNull(),
  phase: text('phase', { enum: ['export', 'erase', 'finalize'] }).notNull(),
  status: text('status', { enum: ['pending', 'done', 'failed'] }).notNull().default('pending'),
  erased: integer('erased').notNull().default(0),
  retained: jsonb('retained').notNull().default([]),
  lastError: text('last_error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const privacyDeletionLedger = app.table('privacy_deletion_ledger', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().unique(),
  requestId: uuid('request_id').notNull(),
  erasedAt: ts('erased_at').notNull(),
  mirroredAt: ts('mirrored_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const privacyLegalHolds = app.table('privacy_legal_holds', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id'),
  orgId: uuid('org_id'),
  scope: text('scope', { enum: ['all', 'applications', 'messages', 'reports', 'billing'] }).notNull(),
  reason: text('reason').notNull(),
  reviewAt: date('review_at').notNull(),
  createdBy: uuid('created_by').notNull(),
  releasedAt: ts('released_at'),
  releasedBy: uuid('released_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const retentionRuns = app.table('retention_runs', {
  id: uuid('id').primaryKey(),
  ruleKey: text('rule_key').notNull(),
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at'),
  deleted: integer('deleted').notNull().default(0),
  status: text('status', { enum: ['running', 'ok', 'partial', 'failed'] }).notNull(),
  error: text('error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
