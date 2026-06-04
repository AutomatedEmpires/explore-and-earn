-- 004_seeker_resume.sql
-- Seeker resume shell: experiences, educations, certifications.
-- All cascade from seeker_profiles. category_tags constrained to the canonical
-- marketplace categories (consistent with seeker_profiles.desired_categories);
-- skill_tags are freeform.

create table seeker_resume_experiences (
  id                uuid primary key default gen_random_uuid(),
  seeker_profile_id uuid not null references seeker_profiles(id) on delete cascade,
  company_name      text,
  role_title        text,
  start_date        date,
  end_date          date,
  is_current        boolean not null default false,
  summary           text,
  category_tags     text[] not null default '{}'
                      check (category_tags <@ array['farm','maritime','remote','seasonal','mix']::text[]),
  skill_tags        text[] not null default '{}',
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_seeker_resume_experiences_profile on seeker_resume_experiences (seeker_profile_id);
create index idx_seeker_resume_experiences_category_tags on seeker_resume_experiences using gin (category_tags);
create index idx_seeker_resume_experiences_skill_tags on seeker_resume_experiences using gin (skill_tags);

create trigger trg_seeker_resume_experiences_updated_at
  before update on seeker_resume_experiences
  for each row execute function set_updated_at();

create table seeker_resume_educations (
  id                uuid primary key default gen_random_uuid(),
  seeker_profile_id uuid not null references seeker_profiles(id) on delete cascade,
  institution       text,
  program_or_degree text,
  start_date        date,
  end_date          date,
  description       text,
  skill_tags        text[] not null default '{}',
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_seeker_resume_educations_profile on seeker_resume_educations (seeker_profile_id);

create trigger trg_seeker_resume_educations_updated_at
  before update on seeker_resume_educations
  for each row execute function set_updated_at();

create table seeker_certifications (
  id                   uuid primary key default gen_random_uuid(),
  seeker_profile_id    uuid not null references seeker_profiles(id) on delete cascade,
  name                 text not null,
  issuing_organization text,
  issued_at            date,
  expires_at           date,
  credential_url       text,
  category_tags        text[] not null default '{}'
                         check (category_tags <@ array['farm','maritime','remote','seasonal','mix']::text[]),
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_seeker_certifications_profile on seeker_certifications (seeker_profile_id);

create trigger trg_seeker_certifications_updated_at
  before update on seeker_certifications
  for each row execute function set_updated_at();
