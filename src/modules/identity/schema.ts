// Drizzle tables for the identity module (drizzle/0100_identity.sql). Only this module
// reads or writes them; other code goes through `@/modules/identity`.
import { sql } from 'drizzle-orm';
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const ACCOUNT_TYPES = ['seeker', 'host', 'operator'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const OPERATOR_ROLES = ['owner', 'operator'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const users = app.table('users', {
  id: uuid('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email'),
  displayName: text('display_name'),
  accountType: text('account_type', { enum: ACCOUNT_TYPES }),
  adultAttestedAt: ts('adult_attested_at'),
  deletedAt: ts('deleted_at'),
  /** Clerk `updated_at` of the snapshot this row was last written from; null on placeholders. */
  clerkUpdatedAt: ts('clerk_updated_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const operators = app.table('operators', {
  userId: uuid('user_id').primaryKey(),
  role: text('role', { enum: OPERATOR_ROLES }).notNull().default('operator'),
  queues: text('queues')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  shiftStatus: text('shift_status', { enum: ['on_shift', 'away'] })
    .notNull()
    .default('away'),
  lastAssignedAt: ts('last_assigned_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const webhookEvents = app.table('webhook_events', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  receivedAt: ts('received_at').notNull().defaultNow(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
