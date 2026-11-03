// Drizzle tables for the audit module. The DDL lives in drizzle/0210_audit_settings.sql.
// Only tables are exported here: src/db/schema.ts re-exports every module's schema file.
import { jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

export const auditEvents = app.table('audit_events', {
  id: uuid('id').primaryKey(),
  actorType: text('actor_type', { enum: ['user', 'operator', 'system'] }).notNull(),
  actorId: uuid('actor_id'),
  orgId: uuid('org_id'),
  action: text('action').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id'),
  data: jsonb('data').$type<Record<string, unknown>>(),
  requestId: text('request_id'),
  ipHash: text('ip_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
