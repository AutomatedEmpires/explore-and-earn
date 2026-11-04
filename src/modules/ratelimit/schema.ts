// Drizzle tables for the ratelimit module. The DDL lives in drizzle/0300_rate_limits.sql.
// Only tables are exported here: src/db/schema.ts re-exports every module's schema file.
import { integer, pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

export const rateLimits = app.table(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
