// Drizzle definitions of drizzle/4050_messaging.sql. The DDL holds the CHECKs and indexes.
import {
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const app = pgSchema('app');
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const threads = app.table('threads', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  listingId: uuid('listing_id').notNull(),
  seekerUserId: uuid('seeker_user_id').notNull(),
  applicationId: uuid('application_id'),
  inviteId: uuid('invite_id'),
  readOnlyReason: text('read_only_reason'),
  listingClosedAt: ts('listing_closed_at'),
  hiredAt: ts('hired_at'),
  lastToSeekerAt: ts('last_to_seeker_at'),
  lastToHostAt: ts('last_to_host_at'),
  firstHostReplyAt: ts('first_host_reply_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const messages = app.table('messages', {
  id: uuid('id').primaryKey(),
  threadId: uuid('thread_id').notNull(),
  senderType: text('sender_type').notNull(),
  senderUserId: uuid('sender_user_id'),
  kind: text('kind').notNull(),
  body: text('body'),
  cardType: text('card_type'),
  cardRefId: uuid('card_ref_id'),
  eventCode: text('event_code'),
  attachmentMediaIds: uuid('attachment_media_ids').array().notNull().default([]),
  visibleTo: text('visible_to').notNull().default('all'),
  scanState: text('scan_state').notNull().default('clear'),
  scanLabels: text('scan_labels').array().notNull().default([]),
  checkId: uuid('check_id'),
  clientId: text('client_id'),
  bulkId: uuid('bulk_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const threadReads = app.table(
  'thread_reads',
  {
    threadId: uuid('thread_id').notNull(),
    userId: uuid('user_id').notNull(),
    lastReadAt: ts('last_read_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);

export const savedReplies = app.table('saved_replies', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const bulkMessages = app.table('bulk_messages', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  listingId: uuid('listing_id').notNull(),
  createdBy: uuid('created_by').notNull(),
  body: text('body').notNull(),
  statuses: text('statuses').array().notNull(),
  recipientCount: integer('recipient_count').notNull(),
  sentCount: integer('sent_count').notNull().default(0),
  threadIds: uuid('thread_ids').array().notNull().default([]),
  scanState: text('scan_state').notNull(),
  checkId: uuid('check_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const orgReplyStats = app.table('org_reply_stats', {
  orgId: uuid('org_id').primaryKey(),
  conversations: integer('conversations').notNull(),
  medianFirstReplyMinutes: integer('median_first_reply_minutes'),
  computedAt: ts('computed_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
