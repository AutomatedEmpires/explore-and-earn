// Drizzle tables for the media module. The DDL lives in drizzle/0600_media.sql.
// Only this module reads or writes them; other code goes through `@/modules/media`.
import { integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { BUCKETS, MEDIA_KINDS, MEDIA_STATUSES } from './kinds';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const media = app.table('media', {
  id: uuid('id').primaryKey(),
  /** References app.users(id). */
  ownerUserId: uuid('owner_user_id').notNull(),
  /** References app.organizations(id). */
  ownerOrgId: uuid('owner_org_id'),
  kind: text('kind', { enum: MEDIA_KINDS }).notNull(),
  status: text('status', { enum: MEDIA_STATUSES }).notNull().default('uploaded'),
  bucket: text('bucket', { enum: BUCKETS }).notNull(),
  path: text('path').notNull(),
  declaredMime: text('declared_mime').notNull(),
  detectedMime: text('detected_mime'),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256'),
  width: integer('width'),
  height: integer('height'),
  altText: text('alt_text'),
  /** Image variants by width: { "320": "<path>/320.webp", ... }. */
  variants: jsonb('variants').$type<Record<string, string>>(),
  rejectionReason: text('rejection_reason'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
