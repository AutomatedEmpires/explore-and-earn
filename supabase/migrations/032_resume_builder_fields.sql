-- Migration 032: Resume builder field extensions
--
-- Adds schema fields required by the 5-step seeker resume builder:
--   • seeker_profiles  — seeking_timeline, general_skill_tags
--   • seeker_resume_experiences — location
--   • seeker_resume_educations  — location, is_current
--   • seeker_certifications     — skill_tags, does_not_expire, description
--
-- All columns use safe IF NOT EXISTS / DEFAULT guards so re-running is idempotent.
-- See docs/migrations/migration-ledger.md for allocation registry governance.

-- ── seeker_profiles ───────────────────────────────────────────────────────────

ALTER TABLE public.seeker_profiles
  ADD COLUMN IF NOT EXISTS seeking_timeline text
    CHECK (seeking_timeline IN ('now', '1_month', '3_months', '6_months')),
  ADD COLUMN IF NOT EXISTS general_skill_tags text[] NOT NULL DEFAULT '{}';

-- ── seeker_resume_experiences ─────────────────────────────────────────────────

ALTER TABLE public.seeker_resume_experiences
  ADD COLUMN IF NOT EXISTS location text;

-- ── seeker_resume_educations ──────────────────────────────────────────────────

ALTER TABLE public.seeker_resume_educations
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;

-- ── seeker_certifications ─────────────────────────────────────────────────────

ALTER TABLE public.seeker_certifications
  ADD COLUMN IF NOT EXISTS skill_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS does_not_expire boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description text;
