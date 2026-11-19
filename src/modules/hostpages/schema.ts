// Drizzle tables for the hostpages module. The DDL lives in drizzle/1300_hostpages.sql.
// Only this module reads or writes them; other code goes through `@/modules/hostpages`.
// Only tables are exported here: src/db/schema.ts re-exports every module's schema file.
import { jsonb, pgSchema, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** One row per organization: the live page, a change waiting on its check, and when it went public. */
export const hostPages = app.table('host_pages', {
  /** References app.organizations(id). */
  orgId: uuid('org_id').primaryKey(),
  /** The live HostPageContent. */
  content: jsonb('content').$type<unknown>().notNull(),
  /** A saved change that `text_safety` is checking, or that waits on an operator. */
  pendingContent: jsonb('pending_content').$type<unknown>(),
  /** Null while the check runs; the check that sent the change to review afterwards. */
  pendingCheckId: uuid('pending_check_id'),
  /** Stamped the first time the org is entitled (spec 8.5, "entitled at least once"). */
  firstPublicAt: ts('first_public_at'),
  /** References app.users(id): who saved the content (live or pending) last. */
  updatedBy: uuid('updated_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** A seeker following a host page. Private: only the count is public, and only past 25. */
export const hostFollows = app.table(
  'host_follows',
  {
    /** References app.users(id). */
    userId: uuid('user_id').notNull(),
    /** References app.organizations(id). */
    orgId: uuid('org_id').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] })],
);
