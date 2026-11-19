-- 4000_hiring (SP5 W0): the host hiring tables. Listing, application and location ids are
-- plain uuid columns. Foreign keys point at app.users, app.media and these tables.

create table app.pipeline_entries (
  application_id uuid primary key,
  org_id uuid not null,
  listing_id uuid not null,
  location_id uuid,
  seeker_user_id uuid not null,
  status text not null check (status in (
    'new', 'shortlisted', 'interviewing', 'offered', 'hired', 'not_selected', 'withdrawn',
    'offer_declined'
  )),
  source text not null check (source in (
    'seek', 'swipe', 'map', 'invite', 'boost', 'landing', 'other'
  )),
  applied_at timestamptz not null,
  last_status_at timestamptz not null,
  fit_score smallint check (fit_score is null or fit_score between 0 and 100),
  fit_lines jsonb,
  fit_weights_version text,
  fit_computed_at timestamptz,
  interview_state text check (interview_state is null or interview_state in (
    'invited', 'scheduled', 'reschedule_requested', 'declined', 'expired', 'canceled',
    'completed', 'no_show'
  )),
  offer_state text check (offer_state is null or offer_state in (
    'sent', 'accepted', 'declined', 'canceled'
  )),
  hired_source text check (hired_source is null or hired_source in ('host', 'offer_accepted')),
  hired_at timestamptz,
  additional_step_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.pipeline_entries enable row level security;
create index pipeline_entries_listing_status_idx
  on app.pipeline_entries (org_id, listing_id, status);
create index pipeline_entries_applied_idx on app.pipeline_entries (org_id, applied_at desc);
create index pipeline_entries_fit_idx
  on app.pipeline_entries (org_id, fit_score desc nulls last);
create trigger pipeline_entries_set_updated_at before update on app.pipeline_entries
  for each row execute function app.set_updated_at();

create table app.pipeline_events (
  id uuid primary key,
  org_id uuid not null,
  listing_id uuid not null,
  location_id uuid,
  application_id uuid,
  invite_id uuid,
  kind text not null check (kind in (
    'applied', 'shortlisted', 'unshortlisted', 'interview_invited', 'interview_scheduled',
    'interview_completed', 'interview_no_show', 'offered', 'offer_canceled', 'hired',
    'not_selected', 'withdrawn', 'offer_declined', 'invite_sent', 'invite_interested',
    'invite_not_interested', 'invite_applied', 'invite_expired'
  )),
  source text,
  actor_type text not null check (actor_type in ('host', 'seeker', 'system')),
  actor_user_id uuid,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.pipeline_events enable row level security;
create index pipeline_events_org_idx on app.pipeline_events (org_id, occurred_at);
create index pipeline_events_listing_kind_idx
  on app.pipeline_events (listing_id, kind, occurred_at);
create index pipeline_events_application_idx
  on app.pipeline_events (application_id, occurred_at);
create trigger pipeline_events_set_updated_at before update on app.pipeline_events
  for each row execute function app.set_updated_at();

create or replace function app.pipeline_events_insert_only() returns trigger
language plpgsql as $$
begin
  raise exception 'pipeline_events is insert-only';
end;
$$;

create trigger pipeline_events_insert_only
  before update or delete on app.pipeline_events
  for each row execute function app.pipeline_events_insert_only();

create table app.pending_passes (
  application_id uuid primary key,
  org_id uuid not null,
  actor_user_id uuid not null references app.users (id),
  commit_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.pending_passes enable row level security;
create index pending_passes_commit_idx on app.pending_passes (commit_at);
create trigger pending_passes_set_updated_at before update on app.pending_passes
  for each row execute function app.set_updated_at();

create table app.candidate_pool_runs (
  listing_id uuid primary key,
  org_id uuid not null,
  listing_revision_id uuid not null,
  weights_version text not null,
  candidate_count int not null,
  computed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.candidate_pool_runs enable row level security;
create trigger candidate_pool_runs_set_updated_at before update on app.candidate_pool_runs
  for each row execute function app.set_updated_at();

create table app.candidate_pool_entries (
  id uuid primary key,
  listing_id uuid not null,
  org_id uuid not null,
  seeker_user_id uuid not null,
  eligible boolean not null,
  fit_score smallint check (fit_score is null or fit_score between 0 and 100),
  fit_lines jsonb,
  state char(2),
  available_from date,
  skills_norm text[] not null default '{}',
  hidden_at timestamptz,
  saved_at timestamptz,
  computed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.candidate_pool_entries enable row level security;
create unique index candidate_pool_entries_seeker_idx
  on app.candidate_pool_entries (listing_id, seeker_user_id);
create index candidate_pool_entries_fit_idx
  on app.candidate_pool_entries (listing_id, eligible, fit_score desc nulls last);
create trigger candidate_pool_entries_set_updated_at before update on app.candidate_pool_entries
  for each row execute function app.set_updated_at();

create table app.invites (
  id uuid primary key,
  org_id uuid not null,
  listing_id uuid not null,
  seeker_user_id uuid not null references app.users (id),
  candidate_id uuid not null,
  sent_by uuid not null references app.users (id),
  note text check (note is null or char_length(note) <= 300),
  status text not null check (status in (
    'sent', 'interested', 'applied', 'not_interested', 'expired'
  )),
  decline_reason text check (decline_reason is null or decline_reason in (
    'dates', 'location', 'pay', 'role', 'not_looking', 'other'
  )),
  scan_state text not null check (scan_state in ('pending', 'clear', 'warn', 'held')),
  check_id uuid,
  sent_at timestamptz not null,
  expires_at timestamptz not null,
  responded_at timestamptz,
  expiring_reminded_at timestamptz,
  thread_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.invites enable row level security;
create unique index invites_listing_seeker_idx on app.invites (listing_id, seeker_user_id);
create index invites_seeker_sent_idx on app.invites (seeker_user_id, sent_at);
create index invites_status_expires_idx on app.invites (status, expires_at);
create trigger invites_set_updated_at before update on app.invites
  for each row execute function app.set_updated_at();

create table app.interviews (
  id uuid primary key,
  org_id uuid not null,
  listing_id uuid not null,
  application_id uuid not null,
  thread_id uuid not null,
  organizer_user_id uuid not null references app.users (id),
  status text not null check (status in (
    'invited', 'scheduled', 'reschedule_requested', 'declined', 'expired', 'canceled',
    'completed', 'no_show'
  )),
  format text not null check (format in ('video', 'phone', 'in_person')),
  video_url text,
  address text,
  phone_note text,
  note text,
  timezone text not null,
  duration_minutes smallint not null check (duration_minutes in (15, 30, 45, 60, 90)),
  expiry_hours smallint not null check (expiry_hours in (48, 72)),
  round int not null default 1,
  sequence int not null default 0,
  expires_at timestamptz,
  scheduled_slot_id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  requested_windows jsonb,
  request_note text,
  outcome_by uuid,
  outcome_at timestamptz,
  outcome_nudged_at timestamptz,
  scan_state text not null check (scan_state in ('pending', 'clear', 'warn', 'held')),
  check_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.interviews enable row level security;
create unique index interviews_one_active_idx on app.interviews (application_id)
  where status in ('invited', 'scheduled', 'reschedule_requested');
create index interviews_org_start_idx on app.interviews (org_id, scheduled_start);
create index interviews_status_expires_idx on app.interviews (status, expires_at);
create trigger interviews_set_updated_at before update on app.interviews
  for each row execute function app.set_updated_at();

create table app.interview_slots (
  id uuid primary key,
  interview_id uuid not null references app.interviews (id) on delete cascade,
  round int not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_slots_start_key unique (interview_id, round, starts_at)
);
alter table app.interview_slots enable row level security;
create trigger interview_slots_set_updated_at before update on app.interview_slots
  for each row execute function app.set_updated_at();

create table app.offers (
  id uuid primary key,
  org_id uuid not null,
  listing_id uuid not null,
  application_id uuid not null,
  thread_id uuid not null,
  created_by uuid not null references app.users (id),
  status text not null check (status in ('sent', 'accepted', 'declined', 'canceled')),
  position text not null check (char_length(position) <= 120),
  start_date date not null,
  pay_amount_cents int not null,
  pay_max_cents int,
  pay_unit text not null check (pay_unit in (
    'hour', 'day', 'week', 'month', 'season', 'year', 'crew_share'
  )),
  currency text not null default 'USD',
  note text check (note is null or char_length(note) <= 1000),
  letter_media_id uuid references app.media (id),
  prior_status text not null check (prior_status in (
    'new', 'shortlisted', 'interviewing', 'offered', 'hired', 'not_selected', 'withdrawn',
    'offer_declined'
  )),
  responded_at timestamptz,
  scan_state text not null check (scan_state in ('pending', 'clear', 'warn', 'held')),
  check_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.offers enable row level security;
create unique index offers_one_sent_idx on app.offers (application_id) where status = 'sent';
create trigger offers_set_updated_at before update on app.offers
  for each row execute function app.set_updated_at();

create table app.as_described_responses (
  id uuid primary key,
  application_id uuid not null unique,
  org_id uuid not null,
  listing_id uuid not null,
  seeker_user_id uuid references app.users (id) on delete set null,
  eligible_via text not null check (eligible_via in ('host_marked', 'offer_accepted')),
  asks_housing boolean not null,
  asks_meals boolean not null,
  prompted_at timestamptz,
  expires_at timestamptz,
  worked_here boolean,
  housing text check (housing is null or housing in ('yes', 'partly', 'no')),
  meals text check (meals is null or meals in ('yes', 'partly', 'no')),
  pay text check (pay is null or pay in ('yes', 'partly', 'no')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.as_described_responses enable row level security;
create index as_described_org_idx on app.as_described_responses (org_id, submitted_at);
create index as_described_listing_idx on app.as_described_responses (listing_id, submitted_at);
create index as_described_unprompted_idx on app.as_described_responses (prompted_at)
  where prompted_at is null;
create trigger as_described_responses_set_updated_at before update on app.as_described_responses
  for each row execute function app.set_updated_at();
