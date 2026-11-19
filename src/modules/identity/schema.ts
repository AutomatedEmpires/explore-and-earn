// Drizzle tables for the identity module (drizzle/0100_identity.sql to 0103). Only this module
// reads or writes them; other code goes through `@/modules/identity`.
import { sql } from 'drizzle-orm';
import { pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  /** "18 or older: yes", with when the seeker passed the age screen. Every seeker has it. */
  adultAttestedAt: ts('adult_attested_at'),
  /**
   * The year from the age screen's date of birth (legal review 2.6). The full date is never
   * stored. Null for hosts, operators and seekers who onboarded before the screen.
   */
  birthYear: smallint('birth_year'),
  /** When a signed-in request first carried Global Privacy Control (legal review 4.5). */
  analyticsOptOutAt: ts('analytics_opt_out_at'),
  /**
   * When the age screen refused this account (legal review 2.6, drizzle/0103). Only the time,
   * never the date or the year. While it is set, onboarding is refused for the account as seeker
   * and as host. A refused account never holds the adult confirmation and is never a host.
   */
  signupRefusedAt: ts('signup_refused_at'),
  deletedAt: ts('deleted_at'),
  /** SHA-256 of the Clerk user id, set when the person is erased. Null until then. */
  erasedClerkIdSha256: text('erased_clerk_id_sha256').unique(),
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

export const WEBHOOK_EVENT_STATUSES = ['applied', 'rejected', 'ignored'] as const;

export const webhookEvents = app.table('webhook_events', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  /** 'rejected': the event can never apply (drizzle/0101_identity_webhook_status.sql). */
  status: text('status', { enum: WEBHOOK_EVENT_STATUSES }).notNull().default('applied'),
  eventType: text('event_type'),
  reason: text('reason'),
  receivedAt: ts('received_at').notNull().defaultNow(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
