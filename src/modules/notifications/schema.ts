// Drizzle tables for the notifications module. The DDL lives in drizzle/0500_notifications.sql.
// Only tables are exported here: src/db/schema.ts re-exports every module's schema file.
import { sql } from 'drizzle-orm';
import { boolean, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

const CATEGORY_VALUES = [
  'messages',
  'applications',
  'jobs',
  'alerts',
  'community',
  'account',
  'security',
  'billing',
  'operator',
] as const;

const CHANNEL_VALUES = ['email', 'push'] as const;

export const notifications = app.table('notifications', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(),
  category: text('category', { enum: CATEGORY_VALUES }).notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  readAt: ts('read_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const notificationPreferences = app.table(
  'notification_preferences',
  {
    userId: uuid('user_id').notNull(),
    category: text('category', { enum: CATEGORY_VALUES }).notNull(),
    channel: text('channel', { enum: CHANNEL_VALUES }).notNull(),
    enabled: boolean('enabled').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category, t.channel] })],
);

export const pushSubscriptions = app.table('push_subscriptions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  lastSuccessAt: ts('last_success_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const emailSuppressions = app.table('email_suppressions', {
  email: text('email').primaryKey(),
  reason: text('reason', { enum: ['bounce', 'complaint', 'manual'] }).notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const notificationBatches = app.table('notification_batches', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  batchKey: text('batch_key').notNull(),
  channel: text('channel', { enum: CHANNEL_VALUES }).notNull(),
  notificationIds: uuid('notification_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  sendAfter: ts('send_after').notNull(),
  status: text('status', { enum: ['pending', 'sent'] })
    .notNull()
    .default('pending'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
