// Drizzle definitions of drizzle/3000_profiles.sql (SP4 spec 4.1, W0 Task 7). The DDL holds the
// CHECKs; these mirror its columns for typed queries. Only the profiles module reads or writes
// these tables; other code goes through `@/modules/profiles`.
import {
  boolean,
  char,
  date,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ProfileSnapshotV1 } from '@/lib/profiles/types';

const app = pgSchema('app');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
/** 'YYYY-MM-DD'; month columns hold the first of the month. */
const day = (name: string) => date(name, { mode: 'string' });

const PROVENANCE = ['manual', 'import'] as const;

export const seekerProfiles = app.table('seeker_profiles', {
  /** References app.users(id), on delete cascade. */
  userId: uuid('user_id').primaryKey(),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull().default(''),
  headline: text('headline').notNull().default(''),
  bio: text('bio').notNull().default(''),
  city: text('city').notNull().default(''),
  region: text('region'),
  countryCode: char('country_code', { length: 2 }).notNull().default('US'),
  phone: text('phone'),
  /** References app.media(id), on delete set null (the three media columns). */
  avatarMediaId: uuid('avatar_media_id'),
  coverMediaId: uuid('cover_media_id'),
  uploadedResumeMediaId: uuid('uploaded_resume_media_id'),
  visibleToHosts: boolean('visible_to_hosts').notNull().default(true),
  showPhotoToHosts: boolean('show_photo_to_hosts').notNull().default(false),
  prefCategories: text('pref_categories').array().notNull().default([]),
  prefOccupations: text('pref_occupations').array().notNull().default([]),
  prefStates: text('pref_states').array().notNull().default([]),
  prefMinPayCents: integer('pref_min_pay_cents'),
  prefMinPayUnit: text('pref_min_pay_unit', { enum: ['hour', 'day', 'year'] }),
  prefHousing: boolean('pref_housing').notNull().default(false),
  prefMeals: boolean('pref_meals').notNull().default(false),
  willingToRelocate: boolean('willing_to_relocate').notNull().default(true),
  workAuthStatus: text('work_auth_status', {
    enum: ['authorized', 'needs_sponsorship', 'has_visa'],
  }),
  workAuthVisaTypes: text('work_auth_visa_types').array().notNull().default([]),
  workAuthVisaEnd: day('work_auth_visa_end'),
  availPreset: text('avail_preset', { enum: ['now', '1_month', '3_months', 'beyond', 'exact'] }),
  availDate: day('avail_date'),
  availConfirmedAt: ts('avail_confirmed_at'),
  availRemindersSent: smallint('avail_reminders_sent').notNull().default(0),
  resumeMode: text('resume_mode', { enum: ['classic', 'compact', 'upload'] })
    .notNull()
    .default('classic'),
  languages: jsonb('languages').$type<ProfileSnapshotV1['languages']>().notNull().default([]),
  portfolioLinks: jsonb('portfolio_links')
    .$type<ProfileSnapshotV1['portfolioLinks']>()
    .notNull()
    .default([]),
  aiImportConsentVersion: text('ai_import_consent_version'),
  aiImportConsentAt: ts('ai_import_consent_at'),
  removedByModerationAt: ts('removed_by_moderation_at'),
  version: integer('version').notNull().default(1),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** The columns every entry table shares. `userId` references app.seeker_profiles(user_id). */
const entryColumns = () => ({
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  sortOrder: integer('sort_order').notNull(),
  provenance: text('provenance', { enum: PROVENANCE }).notNull().default('manual'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const seekerExperiences = app.table('seeker_experiences', {
  ...entryColumns(),
  employer: text('employer').notNull(),
  title: text('title').notNull(),
  location: text('location').notNull().default(''),
  startMonth: day('start_month').notNull(),
  endMonth: day('end_month'),
  isCurrent: boolean('is_current').notNull().default(false),
  description: text('description').notNull().default(''),
});

export const seekerEducation = app.table('seeker_education', {
  ...entryColumns(),
  school: text('school').notNull(),
  program: text('program').notNull().default(''),
  startMonth: day('start_month'),
  endMonth: day('end_month'),
});

export const seekerSkills = app.table(
  'seeker_skills',
  {
    ...entryColumns(),
    label: text('label').notNull(),
    /** normalizeSkill(label).key (SP2). */
    skillKey: text('skill_key').notNull(),
    /** 1-15; null when not highlighted. */
    highlightRank: smallint('highlight_rank'),
  },
  (t) => [
    unique('seeker_skills_user_id_skill_key_key').on(t.userId, t.skillKey),
    unique('seeker_skills_user_id_highlight_rank_key').on(t.userId, t.highlightRank),
  ],
);

export const seekerCertifications = app.table('seeker_certifications', {
  ...entryColumns(),
  name: text('name').notNull(),
  certKey: text('cert_key').notNull(),
  issuer: text('issuer').notNull().default(''),
  issuedOn: day('issued_on'),
  expiresOn: day('expires_on'),
});

export const seekerReveals = app.table(
  'seeker_reveals',
  {
    id: uuid('id').primaryKey(),
    /** References app.users(id), on delete cascade. */
    seekerUserId: uuid('seeker_user_id').notNull(),
    /** References app.organizations(id), on delete cascade. */
    orgId: uuid('org_id').notNull(),
    reason: text('reason', { enum: ['applied', 'invite_interested'] }).notNull(),
    /** The application or the invite. */
    sourceId: uuid('source_id').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('seeker_reveals_grant_key').on(t.seekerUserId, t.orgId, t.reason, t.sourceId)],
);
