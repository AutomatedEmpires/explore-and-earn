-- Migration 032: Seeker dashboard and resume expansion fields
-- Adds columns referenced by the updated seekerResume.ts and SeekerDashboard UI.
-- All new columns use IF NOT EXISTS so applying to a partially-migrated DB is safe.

-- seeker_profiles: hero photo, seeking timeline, location label, general skills
alter table seeker_profiles
  add column if not exists hero_cover_url       text,
  add column if not exists seeking_timeline     text
    check (seeking_timeline in ('now','1_month','3_months','6_months')),
  add column if not exists relative_location    text,
  add column if not exists general_skill_tags   text[] not null default '{}';

-- seeker_resume_experiences: freeform location field
alter table seeker_resume_experiences
  add column if not exists location text;

-- seeker_resume_educations: location + is_current (mirrors experiences pattern)
alter table seeker_resume_educations
  add column if not exists location   text,
  add column if not exists is_current boolean not null default false;

-- seeker_certifications: expiry flag, description, and skill tags
alter table seeker_certifications
  add column if not exists does_not_expire boolean not null default false,
  add column if not exists description     text,
  add column if not exists skill_tags      text[] not null default '{}';
