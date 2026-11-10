// Drizzle tables for the landing module. The DDL lives in drizzle/2100_landing.sql. Only tables
// are exported here: src/db/schema.ts re-exports every module's schema file.
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const LANDING_KIND_VALUES = [
  'state',
  'category',
  'category_state',
  'category_genre',
  'season',
  'destination',
  'international',
] as const;

/** Operator copy overrides; a page without a row uses generated copy. */
export const landingPages = app.table('landing_pages', {
  key: text('key').primaryKey(),
  kind: text('kind', { enum: LANDING_KIND_VALUES }).notNull(),
  title: text('title').notNull(),
  intro: text('intro').notNull().default(''),
  /** An app.media id (SP8's orphan sweep reads this column through the privacy handler). */
  heroMediaId: uuid('hero_media_id'),
  heroAlt: text('hero_alt'),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  /** The operator who last saved the copy; nulled when that user is erased. */
  updatedBy: uuid('updated_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
