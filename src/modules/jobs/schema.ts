// Drizzle tables for the jobs module. The DDL lives in drizzle/0200_jobs.sql.
// Only tables are exported here: src/db/schema.ts re-exports every module's schema file.
import { integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

export const outbox = app.table('outbox', {
  id: uuid('id').primaryKey(),
  topic: text('topic').notNull(),
  payload: jsonb('payload').$type<unknown>().notNull(),
  dedupeKey: text('dedupe_key').unique(),
  status: text('status', { enum: ['pending', 'processing', 'done', 'dead'] })
    .notNull()
    .default('pending'),
  attempts: integer('attempts').notNull().default(0),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scheduleRuns = app.table('schedule_runs', {
  topic: text('topic').primaryKey(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
