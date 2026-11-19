// W5's legal tables. The DDL lives in drizzle/7200_content.sql.
import { boolean, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const LEGAL_STATUSES = [
  'draft',
  'counsel_review',
  'approved',
  'scheduled',
  'published',
  'superseded',
] as const;
export type LegalStatus = (typeof LEGAL_STATUSES)[number];

export const legalDocuments = app.table('legal_documents', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull(),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull(),
  summaryOfChanges: text('summary_of_changes').notNull().default(''),
  counselQuestions: text('counsel_questions').notNull().default(''),
  material: boolean('material').notNull().default(true),
  status: text('status', { enum: LEGAL_STATUSES }).notNull().default('draft'),
  counselApprovedAt: ts('counsel_approved_at'),
  counselNote: text('counsel_note'),
  effectiveAt: ts('effective_at'),
  publishedAt: ts('published_at'),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const legalAcceptances = app.table('legal_acceptances', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  slug: text('slug').notNull(),
  version: integer('version').notNull(),
  acceptedAt: ts('accepted_at').notNull().defaultNow(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
