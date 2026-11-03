// Drizzle tables for the orgs module (created in drizzle/0100_identity.sql). Only this module
// reads or writes them; other code goes through `@/modules/orgs`.
import { pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const ORG_ROLES = ['owner', 'admin', 'recruiter', 'billing'] as const;

export const organizations = app.table('organizations', {
  id: uuid('id').primaryKey(),
  clerkOrgId: text('clerk_org_id').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  /** References app.users(id). */
  ownerUserId: uuid('owner_user_id'),
  deletedAt: ts('deleted_at'),
  /** Clerk `updated_at` of the snapshot this row was last written from; null on placeholders. */
  clerkUpdatedAt: ts('clerk_updated_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const orgMemberships = app.table(
  'org_memberships',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id').notNull(),
    /** References app.users(id). */
    userId: uuid('user_id').notNull(),
    role: text('role', { enum: ORG_ROLES }).notNull(),
    /** Set when the member was removed; the row is kept so reordered events can't revive it. */
    deletedAt: ts('deleted_at'),
    clerkUpdatedAt: ts('clerk_updated_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('org_memberships_org_id_user_id_key').on(t.orgId, t.userId)],
);
