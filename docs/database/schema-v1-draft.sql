-- ============================================================================
-- Explore&Earn — DATABASE V1 SCHEMA *DRAFT* (REVIEW ONLY)
-- DO NOT RUN. DO NOT place in supabase/migrations/ until founder-approved.
-- Mirrored from Notion canon (Schema Strategy, Exact Data Dictionary, SQL
-- Blueprint, Migration Order, Enum/Lifecycle/Permission registries).
-- Conventions: uuid PK gen_random_uuid() (DR-B2); enums = text+CHECK from the
-- Enum Registry (DR-B1); money = integer cents (DR-B3); timestamptz UTC; soft
-- delete via archived_at/deleted_at (DR-B4). '-- PROPOSED' = founder gate.
-- This file is the full breadth; per-column exhaustive lists live in the
-- Exact Data Dictionary. Copilot: review shapes/constraints, not values.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive email

-- ---- helpers ---------------------------------------------------------------
create or replace function app_set_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

-- DR-B10 / G16: data-driven lifecycle guard (table seeded from contracts/lifecycles.ts)
create table lifecycle_transitions (
  entity     text not null,
  from_state text not null,
  to_state   text not null,
  primary key (entity, from_state, to_state)
);

create or replace function assert_lifecycle_transition() returns trigger
  language plpgsql as $$
begin
  if tg_argv[0] is null then raise exception 'entity arg required'; end if;
  if new.status is distinct from old.status then
    if not exists (select 1 from lifecycle_transitions t
                   where t.entity = tg_argv[0]
                     and t.from_state = old.status
                     and t.to_state   = new.status) then
      raise exception 'illegal % transition: % -> %', tg_argv[0], old.status, new.status;
    end if;
  end if;
  return new;
end; $$;

-- ===========================================================================
-- 002 — identity (app-owned shadow of auth.users) + team membership
-- ===========================================================================
create table users (
  id            uuid primary key,                 -- == auth.users.id (DR-B9 trigger)
  email         citext unique not null,
  display_name  text,
  avatar_media_id uuid,
  primary_scope text not null default 'seeker'
                  check (primary_scope in ('seeker','host','admin')),
  is_age_verified boolean not null default false,  -- 18+ self-attested (G25)
  status        text not null default 'active'
                  check (status in ('active','restricted','suspended','banned')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger trg_users_updated before update on users
  for each row execute function app_set_updated_at();

create table team_memberships (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references host_profiles(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  -- DR-B5: roles from Permission/RLS Registry (legacy names retired — founder gate)
  role_preset text not null
                check (role_preset in ('owner','admin','hiring_manager','analyst','billing','viewer')),
  status      text not null default 'active'
                check (status in ('active','invited','revoked')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (host_id, user_id)
);

-- ===========================================================================
-- 003 — profiles + ADR-029 attestation (NO verified_status — G3)
-- ===========================================================================
create table seeker_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references users(id) on delete cascade,
  headline        text,
  open_to         text,                            -- free-form 'open-to' statement
  desired_categories text[] not null default '{}', -- subset of ListingCategory
  needs_housing   boolean,
  needs_meals     boolean,
  travel_radius_km integer,
  completion_score smallint not null default 0,     -- materialized (recompute on event)
  match_confidence_score smallint not null default 0,
  status          text not null default 'active'
                    check (status in ('active','paused','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz, deleted_at timestamptz
);

create table host_profiles (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references users(id),
  org_name        text not null,
  about           text,
  completion_score smallint not null default 0,
  -- ADR-029 trust MIRROR — written ONLY via set_host_attestation() (G2). NO verified_status (G3).
  attestation_status text not null default 'not_attested'
                    check (attestation_status in ('not_attested','attested','lapsed','revoked')),
  current_attestation_id uuid,
  last_attested_at timestamptz,
  last_attested_policy_version integer,
  account_status  text not null default 'active'    -- admin-write only (RLS)
                    check (account_status in ('active','under_review','removed','suspended')),
  removed_reason_code text,
  removed_at      timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz, deleted_at timestamptz
);

create table attestation_policy (
  id              uuid primary key default gen_random_uuid(),
  current_version integer not null,
  body            text not null,
  effective_at    timestamptz not null default now()
);

-- append-only; immutable (enforce via RLS: no update/delete)
create table host_attestations (
  id             uuid primary key default gen_random_uuid(),
  host_id        uuid not null references host_profiles(id) on delete cascade,
  policy_version integer not null,
  attested_by    uuid not null references users(id),
  attested_at    timestamptz not null default now()
);

-- DR-B12-style guarded mirror writer (G2): only path that updates host_profiles trust mirror
create or replace function set_host_attestation(p_host uuid, p_user uuid) returns void
  language plpgsql security definer as $$
declare v_ver integer; v_att uuid;
begin
  select current_version into v_ver from attestation_policy order by effective_at desc limit 1;
  insert into host_attestations(host_id, policy_version, attested_by)
    values (p_host, v_ver, p_user) returning id into v_att;
  update host_profiles
     set attestation_status='attested', current_attestation_id=v_att,
         last_attested_at=now(), last_attested_policy_version=v_ver
   where id = p_host;
end; $$;

create table host_removal_appeals (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references host_profiles(id) on delete cascade,
  status     text not null default 'submitted'
               check (status in ('submitted','under_review','upheld','overturned','withdrawn')),
  reason     text,
  decided_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===========================================================================
-- 004 — resume tables (seeker)
-- ===========================================================================
create table seeker_resume_experiences (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  title text, org text, start_date date, end_date date, summary text,
  created_at timestamptz not null default now()
);
create table seeker_resume_educations (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  school text, credential text, start_date date, end_date date,
  created_at timestamptz not null default now()
);
create table seeker_certifications (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  name text not null, issuer text, issued_at date, expires_at date,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- 005 — media (pending media is NOT public — G10)
-- ===========================================================================
create table media_buckets (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,                          -- supabase storage bucket key
  kind text not null check (kind in ('listing','host','seeker','community','system'))
);
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references media_buckets(id),
  owner_user_id uuid references users(id),
  storage_path text not null,
  mime text, width int, height int,
  visibility text not null default 'private'
               check (visibility in ('private','authenticated','public')),
  moderation_status text not null default 'pending'
               check (moderation_status in ('pending','under_review','approved','rejected','removed')),
  created_at timestamptz not null default now(),
  archived_at timestamptz, deleted_at timestamptz
);

-- ===========================================================================
-- 006 — listings (single canonical table — NO per-category tables — G7)
-- ===========================================================================
create table listings (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references host_profiles(id) on delete cascade,
  title         text not null,
  category      text not null
                  check (category in ('farm','maritime','remote','seasonal','mix')),
  setting       text,                               -- e.g. 'lodge' is a SETTING under seasonal, not a category
  mix_domains   text[],                             -- PROPOSED (DR-B6): subset for category='mix'; founder gate
  -- Triad (every listing must answer where-sleep / what-eat / what-earn):
  housing_provided boolean,
  housing_details  text,
  meals_provided   boolean,
  meals_details    text,
  pay_amount_cents integer,                          -- DR-B3
  pay_unit         text check (pay_unit in ('hour','day','week','month','stipend','volunteer')),
  start_date date, end_date date,
  role_capacity   integer not null default 1,
  accepted_count  integer not null default 0,        -- materialized
  remaining_role_count integer generated always as (greatest(role_capacity - accepted_count,0)) stored,
  filled_status   text not null default 'open'
                    check (filled_status in ('open','partially_filled','filled')),
  completion_score smallint not null default 0,
  status          text not null default 'draft'      -- ListingStatus (Enum Registry)
                    check (status in ('draft','live','paused','closed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz, deleted_at timestamptz
);
create trigger trg_listings_lifecycle before update on listings
  for each row execute function assert_lifecycle_transition('listing');

create table listing_relevance_extensions (
  listing_id uuid primary key references listings(id) on delete cascade,
  skill_tags text[] not null default '{}',
  required_certs text[] not null default '{}',
  visa_support boolean,
  region text
);
create table listing_media_overrides (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  media_id   uuid not null references media_assets(id),
  slot       text,                                   -- e.g. cover / housing / meals
  sort_order int not null default 0
);

-- ===========================================================================
-- 007 — saved / applications / invites / offers (NO accepted_role entity — G6)
-- ===========================================================================
create table saved_listings (
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (seeker_id, listing_id)
);
create table applications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  seeker_id  uuid not null references seeker_profiles(id) on delete cascade,
  status text not null default 'submitted'            -- ApplicationStatus: NO 'declined' (registry)
           check (status in ('submitted','viewed','shortlisted','accepted','active','withdrawn','not_selected','expired')),
  expires_at timestamptz,                             -- 30d auto-expire via sweep (DR-B8/B10)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, seeker_id)
);
create trigger trg_applications_lifecycle before update on applications
  for each row execute function assert_lifecycle_transition('application');
create table invites (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  host_id uuid not null references host_profiles(id) on delete cascade,
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  status text not null default 'sent'
           check (status in ('sent','viewed','accepted','declined','expired','withdrawn')),
  expires_at timestamptz,                             -- 14d
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) on delete set null,
  listing_id uuid not null references listings(id) on delete cascade,
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  status text not null default 'extended'
           check (status in ('extended','viewed','accepted','declined','rescinded','expired')),
  expires_at timestamptz,                             -- 7d
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table host_saved_seekers (
  host_id uuid not null references host_profiles(id) on delete cascade,
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (host_id, seeker_id)
);
create table host_skipped_seekers (
  host_id uuid not null references host_profiles(id) on delete cascade,
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (host_id, seeker_id)
);

-- ===========================================================================
-- 008 — notifications
-- ===========================================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null, payload jsonb not null default '{}',
  read_at timestamptz, created_at timestamptz not null default now()
);
create table notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  channels jsonb not null default '{}'                -- per-type channel matrix (G18)
);
create table notification_delivery_log (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references notifications(id) on delete cascade,
  channel text, status text, sent_at timestamptz, expires_at timestamptz
);
create table notification_suppression_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  type text, suppressed_until timestamptz
);

-- ===========================================================================
-- 009 — billing / entitlements / refund / founding (cents — DR-B3; G1/G5/G17/G29)
-- ===========================================================================
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references host_profiles(id) on delete cascade,
  plan_tier text not null check (plan_tier in ('starter','pro','enterprise')),
  interval text not null check (interval in ('monthly','annual')),
  amount_cents integer not null,                      -- ADR-028 founder-locked values
  is_founding boolean not null default false,
  stripe_subscription_id text unique,
  status text not null default 'active'
           check (status in ('trialing','active','past_due','canceled','paused')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table plan_entitlements (
  plan_tier text primary key check (plan_tier in ('starter','pro','enterprise')),
  limits jsonb not null default '{}'                  -- featured_employer is NEVER default (G21)
);
create table add_on_purchases (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references host_profiles(id),
  kind text not null check (kind in ('boost','featured','team_seat','invite_pack')),
  amount_cents integer not null,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);
create table invite_credit_ledger (                   -- non-refundable credits
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references host_profiles(id) on delete cascade,
  amount integer not null,                            -- signed (purchase + / consume -)
  source text not null check (source in ('purchased','consumed','adjustment')),
  created_at timestamptz not null default now()
);
create table boost_campaigns (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  duration_days int not null check (duration_days in (7,14,28)),
  amount_cents integer not null,                      -- 20000/35000/50000 (ADR-028)
  delivered_impressions int not null default 0,
  delivery_status text not null default 'under_delivered'
           check (delivery_status in ('under_delivered','on_track','over_delivered')),
  status text not null default 'active'
           check (status in ('active','paused','completed','canceled')),
  starts_at timestamptz not null default now(), ends_at timestamptz
);
create table featured_employer_campaigns (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references host_profiles(id) on delete cascade,
  category_scope text[] not null default '{}',
  delivered_impressions int not null default 0,
  delivery_status text not null default 'under_delivered',
  status text not null default 'active'
           check (status in ('active','paused','completed','canceled')),
  starts_at timestamptz not null default now(), ends_at timestamptz
);
create table founding_program_state (
  id uuid primary key default gen_random_uuid(),
  total_seats int not null,
  claimed_seats int not null default 0,               -- claim_founding_seat() guards the cap (G24)
  is_open boolean not null default true
);
create table refund_reviews (                          -- ONLY refund path (ADR-015 / G5)
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references host_profiles(id),
  subscription_id uuid references subscriptions(id),
  amount_requested_cents integer,
  outcome_type text check (outcome_type in ('full_refund','partial_refund','service_credit','denied')),
  status text not null default 'submitted'
           check (status in ('submitted','under_review','approved','denied','processed')),
  stripe_refund_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table dispute_cases (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid references users(id),
  context_type text, context_id uuid,
  status text not null default 'open'
           check (status in ('open','under_review','resolved','closed')),
  created_at timestamptz not null default now()
);
create table service_credit_ledger (                   -- append-only, FIFO 12mo (G29 / DR-B13)
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references host_profiles(id) on delete cascade,
  amount_cents integer not null,                      -- signed
  source text not null check (source in ('issued','redeemed','expired')),
  expires_at timestamptz,                             -- issued_at + 12 months for issued lots
  created_at timestamptz not null default now()
);
create table stripe_webhook_events (                   -- idempotency (G17 / DR-B12)
  event_id text primary key,
  type text not null, payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ===========================================================================
-- 010 — messaging / scheduling / travel (5 contexts; NO external calendar — G9/G12)
-- ===========================================================================
create table conversation_threads (
  id uuid primary key default gen_random_uuid(),
  context_type text not null
           check (context_type in ('invite','application','offer','dispute','support')),
  context_id uuid,
  host_id uuid references host_profiles(id) on delete cascade,
  seeker_id uuid references seeker_profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed','archived')),
  created_at timestamptz not null default now()
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references conversation_threads(id) on delete cascade,
  sender_user_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()       -- rate-limited at service layer (G26)
);
create table scheduling_requests (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references conversation_threads(id) on delete cascade,
  proposed_at timestamptz, status text not null default 'proposed'
           check (status in ('proposed','accepted','declined','canceled'))
  -- NOTE: calendar_provider / external_calendar_event_id intentionally OMITTED (G9)
);
create table travel_plans (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  shared_with_host boolean not null default false,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- 011 — reviews / reports / moderation / audit (G15 audit on mutation)
-- ===========================================================================
create table reviews (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid references users(id),
  subject_type text, subject_id uuid, rating smallint, body text,
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now()
);
create table check_ins (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid references seeker_profiles(id), listing_id uuid references listings(id),
  status text not null default 'pending', created_at timestamptz not null default now()
);
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references users(id),
  target_type text not null, target_id uuid not null,
  reason text, severity text check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','under_review','actioned','dismissed')),
  created_at timestamptz not null default now()
);
create table moderation_cases (
  id uuid primary key default gen_random_uuid(),
  target_type text, target_id uuid,
  status text not null default 'open' check (status in ('open','under_review','resolved')),
  created_at timestamptz not null default now()
);
create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references moderation_cases(id) on delete cascade,
  action text not null, actor_user_id uuid references users(id),
  created_at timestamptz not null default now()
);
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id),
  action text not null, entity_type text, entity_id uuid,
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

-- ===========================================================================
-- 012 — matching / discovery (match_score has NO monetization — G8 / DR-B14)
-- ===========================================================================
create table match_results (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references seeker_profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  match_score smallint not null,                      -- 0..100, monetization-free
  match_confidence smallint not null default 0,
  computed_at timestamptz not null default now(),
  unique (seeker_id, listing_id)
);
create table candidate_pools (   -- ephemeral cache (DR-B4 hard-delete)
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid references seeker_profiles(id) on delete cascade,
  payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create table discovery_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  mode text check (mode in ('seek','swipe','map','feed')),
  created_at timestamptz not null default now()
);
create table discovery_impressions (
  id uuid primary key default gen_random_uuid(),     -- UUIDv7 candidate (DR-B2)
  session_id uuid references discovery_sessions(id) on delete cascade,
  listing_id uuid references listings(id),
  rank_position int, was_boosted boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- 013 — community / content / feed
-- ===========================================================================
create table community_photo_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid references users(id),
  media_id uuid references media_assets(id),
  caption text,
  status text not null default 'pending' check (status in ('pending','approved','hidden','removed')),
  created_at timestamptz not null default now()
);
create table host_announcements (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references host_profiles(id) on delete cascade,
  body text, expires_at timestamptz, created_at timestamptz not null default now()
);
create table platform_posts (
  id uuid primary key default gen_random_uuid(),
  body text, status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now()
);
create table feed_items (        -- materialized composition slots (5 photo/2 announce/1 listing/1 platform/1 flex)
  id uuid primary key default gen_random_uuid(),
  item_type text not null, item_id uuid not null, created_at timestamptz not null default now()
);
create table positive_reactions (  -- seekers only (RLS); hosts/admins cannot write
  user_id uuid not null references users(id) on delete cascade,
  feed_item_id uuid not null references feed_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, feed_item_id)
);

-- ===========================================================================
-- 014 — analytics
-- ===========================================================================
create table analytics_events (   -- mirror of PostHog-bound events (append-only)
  id uuid primary key default gen_random_uuid(),     -- UUIDv7 candidate
  user_id uuid, name text not null, props jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table analytics_snapshots ( -- rolled up by Vercel Cron job (DR-B8)
  id uuid primary key default gen_random_uuid(),
  scope text not null, key text not null, value jsonb not null default '{}',
  captured_at timestamptz not null default now()
);

-- ===========================================================================
-- safe public views (security_barrier) — the ONLY anon/public read surface (DR-B11)
-- ===========================================================================
create view public_listings_view with (security_barrier=true) as
  select id, host_id, title, category, setting, housing_provided, meals_provided,
         pay_amount_cents, pay_unit, start_date, end_date, filled_status
    from listings
   where status = 'live' and deleted_at is null;

create view public_host_profiles_view with (security_barrier=true) as
  select id, org_name, about, attestation_status   -- badge renders 'Self-Declared by Host' (G22)
    from host_profiles
   where account_status = 'active' and deleted_at is null;

create view public_community_feed_view with (security_barrier=true) as
  select fi.id, fi.item_type, fi.item_id, fi.created_at
    from feed_items fi;
-- END DRAFT
