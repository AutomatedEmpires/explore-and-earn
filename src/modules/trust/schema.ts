// Drizzle tables for the trust module. The DDL lives in drizzle/0400_trust.sql and
// drizzle/0401_trust_check_alt_text.sql.
// Only tables are exported here: src/db/schema.ts re-exports every module's schema file.
import { sql } from 'drizzle-orm';
import { integer, jsonb, pgSchema, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ACTION_STATUSES, CHECK_DECISIONS, QUEUES, REVIEW_ACTIONS, REVIEW_STATUSES } from './types';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const trustChecks = app.table('trust_checks', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  score: real('score'),
  labels: text('labels')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  reason: text('reason').notNull(),
  decision: text('decision', { enum: CHECK_DECISIONS }).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  error: text('error'),
  /** Image checks asked for alt text (wantAltText) only. */
  altText: text('alt_text'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const reviewItems = app.table('review_items', {
  id: uuid('id').primaryKey(),
  queue: text('queue', { enum: QUEUES }).notNull(),
  status: text('status', { enum: REVIEW_STATUSES }).notNull().default('open'),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  checkId: uuid('check_id'),
  reason: text('reason').notNull(),
  aiConfidence: real('ai_confidence'),
  priority: integer('priority').notNull().default(0),
  assigneeOperatorId: uuid('assignee_operator_id'),
  assignedAt: ts('assigned_at'),
  escalatedTo: uuid('escalated_to'),
  excludeOperatorIds: uuid('exclude_operator_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  slaDueAt: ts('sla_due_at').notNull(),
  slaBreachedAt: ts('sla_breached_at'),
  decidedBy: uuid('decided_by'),
  originalItemId: uuid('original_item_id'),
  resolution: text('resolution', { enum: REVIEW_ACTIONS }),
  resolvedAt: ts('resolved_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const reviewNotes = app.table('review_notes', {
  id: uuid('id').primaryKey(),
  itemId: uuid('item_id').notNull(),
  authorOperatorId: uuid('author_operator_id').notNull(),
  body: text('body').notNull(),
  mentions: uuid('mentions')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const reviewActions = app.table('review_actions', {
  id: uuid('id').primaryKey(),
  itemId: uuid('item_id').notNull(),
  action: text('action', { enum: REVIEW_ACTIONS }).notNull(),
  actorOperatorId: uuid('actor_operator_id').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>(),
  status: text('status', { enum: ACTION_STATUSES }).notNull(),
  secondOperatorId: uuid('second_operator_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
