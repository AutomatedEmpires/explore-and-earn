-- 018_seeker_profile_fields.sql
-- Wave 9 / Agent B — Seeker onboarding support.
--
-- REUSE DECISION (minimize schema drift): the onboarding wizard maps onto
-- columns that already exist on seeker_profiles rather than adding duplicates:
--   bio          -> short_bio          (existing)
--   housing_pref -> housing_preference (existing; CHECK required|preferred|not_needed|flexible)
--   skills       -> desired_categories (existing text[]; CHECK subset of marketplace categories)
--                 + desired_roles      (existing text[]; freeform tags)
--   display_name -> display_name       (existing)
-- Only the two genuinely-new fields are added here.
ALTER TABLE seeker_profiles
  ADD COLUMN IF NOT EXISTS location_pref TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false;
