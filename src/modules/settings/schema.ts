// Drizzle tables for the settings module. The DDL lives in drizzle/0210_audit_settings.sql.
// Only tables are exported here: src/db/schema.ts re-exports every module's schema file.
import { jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

export const settings = app.table('settings', {
  key: text('key').primaryKey(),
  // Read back as `value::text` and parsed once: Drizzle's jsonb mapping would turn a stored
  // string such as "12345" into a number.
  value: jsonb('value').$type<unknown>().notNull(),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
