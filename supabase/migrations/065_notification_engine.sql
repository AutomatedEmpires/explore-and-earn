-- ---------------------------------------------------------------------------
-- 065_notification_engine.sql
--
-- Lifecycle & Engagement Notification Engine (founder charter 2026-07-14).
-- Event-driven, preference-aware, exactly-once-LOGICAL delivery across
-- in-app / email / web-push:
--
--   * notification_deliveries — one row per (event × recipient × channel ×
--     variant): the durable delivery state machine. The unique dedup_key is
--     the idempotency boundary; lease-based claiming (SKIP LOCKED RPC) makes
--     concurrent workers and crashed workers safe; next_attempt_at drives
--     bounded-backoff retries; dead_letter rows are retained for
--     investigation.
--   * push_subscriptions — owner-scoped web-push endpoints (unique endpoint;
--     keys are held server-side only — no anon/authed SELECT policy exposes
--     them; terminal provider responses revoke).
--   * email_suppressions — hard bounces/complaints stop future email BEFORE
--     provider submission. Service-role only.
--   * digest_memberships — durable daily/weekly digest queue; unique
--     (recipient, cadence, event) so an event can never appear in two windows.
--   * notification_processed_events — the dispatcher's taxonomy watermark:
--     an event is expanded into deliveries exactly once (re-processing is a
--     no-op via this marker + the deliveries dedup_key).
--   * notification_engine_prefs — typed, server-authoritative preferences
--     (per-category channel/cadence overrides, quiet hours, timezone) keyed
--     by Clerk id, superseding the three seeker email booleans without
--     removing them.
--
-- CORE INVARIANT backed by this schema: a delivery row can exist only for a
-- persisted events row (FK) — a notification can never be fabricated without
-- a real domain event behind it.
--
-- Additive-only: new tables/functions plus one purely-widening change — the
-- notifications.category CHECK gains 'matches'/'messages' (§7; every existing
-- row stays valid). notifications' dedupe_key + unique index already exist
-- from 008 and are reused as-is.
--
-- REVIEW-ONLY: this migration is a schema DEFINITION and is NOT applied to
-- any live database here. Prod apply is founder-operated via the pipeline.
-- ---------------------------------------------------------------------------

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Delivery state machine
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.notification_deliveries (
  id                        uuid        primary key default gen_random_uuid(),
  -- REAL EVENTS ONLY: a delivery is anchored to a persisted domain event.
  -- The ONLY exceptions (CHECK below) are the charter's schedule-DERIVED
  -- reminders — each is computed from REAL current database state (an
  -- unexpired offer/listing row, a genuinely incomplete résumé, real new
  -- saved-search inventory) and re-checked against that state immediately
  -- before send — plus the digest envelope itself (whose member events are
  -- each individually event-anchored via digest_memberships.event_id).
  -- RESTRICT: the delivery LEDGER must never be silently cascade-deleted —
  -- any future events-purge path has to handle this table explicitly.
  event_id                  uuid        references public.events(id) on delete restrict,
  recipient_clerk_user_id   text        not null,
  channel                   text        not null check (channel in ('in_app', 'email', 'push')),
  -- Category mirrors the settings model (see contracts NOTIFICATION_CATEGORIES).
  category                  text        not null,
  notification_type         text        not null,
  -- Variant distinguishes intentionally-different notifications from one
  -- event (e.g. seeker-facing vs host-facing copy).
  variant                   text        not null default 'default',
  -- THE idempotency boundary: event × recipient × category × channel × variant.
  dedup_key                 text        not null unique,
  status                    text        not null default 'pending'
                              check (status in (
                                'pending', 'deferred', 'processing', 'delivered',
                                'suppressed', 'failed_retryable', 'failed_terminal',
                                'dead_letter', 'cancelled'
                              )),
  attempt_count             integer     not null default 0,
  next_attempt_at           timestamptz not null default now(),
  -- Worker lease: a crashed worker's rows become reclaimable when the lease
  -- expires; claim_notification_deliveries() enforces this atomically.
  lease_expires_at          timestamptz,
  worker_id                 text,
  -- Rendering inputs (typed intent payload: translation keys + SAFE
  -- interpolation values + locale + path — never pre-rendered English,
  -- never raw HTML).
  intent                    jsonb       not null default '{}'::jsonb,
  -- Cadence resolved at materialization: immediate | daily | weekly.
  cadence                   text        not null default 'immediate'
                              check (cadence in ('immediate', 'daily', 'weekly')),
  provider_message_id       text,
  failure_class             text,
  failure_detail            text,
  suppression_reason        text,
  -- Collapse/digest grouping: which delivery represented this one (thread
  -- collapse, digest batches) — the delivery log preserves what a collapsed
  -- notification represented.
  collapsed_into_delivery_id uuid       references public.notification_deliveries(id) on delete set null,
  delivered_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint notification_deliveries_event_anchor_chk check (
    event_id is not null
    or notification_type in (
      'resume_nudge', 'offer_expiring', 'listing_expiring',
      'saved_search_results', 'digest'
    )
  )
);

-- Dispatcher access patterns (each backed by a real query):
--   * eligible work: due pending/deferred/retryable rows;
create index if not exists idx_notif_deliveries_eligible
  on public.notification_deliveries (next_attempt_at)
  where status in ('pending', 'deferred', 'failed_retryable');
--   * per-event fanout audit;
create index if not exists idx_notif_deliveries_event
  on public.notification_deliveries (event_id);
--   * per-recipient throttling window + history;
create index if not exists idx_notif_deliveries_recipient_created
  on public.notification_deliveries (recipient_clerk_user_id, created_at desc);
--   * throttle window (delivered outbound per recipient per hour);
create index if not exists idx_notif_deliveries_recipient_delivered
  on public.notification_deliveries (recipient_clerk_user_id, delivered_at)
  where status = 'delivered';
--   * burst-collapse lookup (open siblings in one collapse group);
create index if not exists idx_notif_deliveries_collapse
  on public.notification_deliveries
    (recipient_clerk_user_id, channel, (intent->>'collapseKey'))
  where status in ('pending', 'deferred', 'failed_retryable', 'processing');
--   * lease recovery sweep;
create index if not exists idx_notif_deliveries_processing_lease
  on public.notification_deliveries (lease_expires_at)
  where status = 'processing';

alter table public.notification_deliveries enable row level security;
-- Service-role only (dispatcher). No anon/authenticated policies: recipients
-- read the notifications table, not the delivery ledger.

-- Atomic worker claim: leases up to p_limit due rows for p_worker, skipping
-- rows other workers hold. Expired 'processing' leases are reclaimable —
-- a crashed worker's rows return to the pool automatically.
create or replace function public.claim_notification_deliveries(
  p_worker_id     text,
  p_limit         integer default 20,
  p_lease_seconds integer default 120
) returns setof public.notification_deliveries
language plpgsql
as $$
begin
  -- Crash-loop bound: a row whose worker repeatedly dies AFTER a successful
  -- send but BEFORE settling never reaches the failure path's attempt budget
  -- (it keeps being reclaimed on lease expiry). Rows that have burned the
  -- whole attempt budget while stuck in 'processing' are dead-lettered here
  -- instead of being re-sent forever.
  update public.notification_deliveries d
     set status = 'dead_letter',
         failure_class = 'terminal',
         failure_detail = 'lease repeatedly expired past the attempt budget',
         worker_id = null,
         lease_expires_at = null,
         updated_at = now()
   where d.status = 'processing'
     and d.lease_expires_at < now()
     and d.attempt_count >= 6;

  return query
  with claimable as (
    select d.id
      from public.notification_deliveries d
     where (
             d.status in ('pending', 'deferred', 'failed_retryable')
             and d.next_attempt_at <= now()
           )
        or (d.status = 'processing' and d.lease_expires_at < now())
     order by d.next_attempt_at
     limit greatest(1, least(p_limit, 100))
     for update skip locked
  )
  update public.notification_deliveries d
     set status = 'processing',
         worker_id = p_worker_id,
         lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 3600))),
         attempt_count = d.attempt_count + 1,
         updated_at = now()
    from claimable
   where d.id = claimable.id
  returning d.*;
end;
$$;

revoke execute on function public.claim_notification_deliveries(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(text, integer, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Dispatcher watermark (taxonomy expansion happens once per event)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.notification_processed_events (
  event_id     uuid        primary key references public.events(id) on delete cascade,
  processed_at timestamptz not null default now(),
  -- How many deliveries the taxonomy materialized (0 = event had no
  -- notification mapping — still marked so it is never re-examined).
  delivery_count integer   not null default 0
);

alter table public.notification_processed_events enable row level security;
-- Service-role only.

-- Composite index serving the unprocessed-feed's (occurred_at, id) ordering.
-- events is still small (first writers landed with the sourcing engine), so
-- a plain CREATE INDEX here is cheap; if events grows unboundedly, replace
-- the anti-join below with a watermark cursor.
create index if not exists idx_events_occurred_at_id
  on public.events (occurred_at, id);

-- Unprocessed-event feed for the dispatcher: oldest-first events the taxonomy
-- has not yet expanded. Anti-join via the watermark table; bounded.
create or replace function public.get_unprocessed_notification_events(
  p_limit integer default 100
) returns setof public.events
language sql
stable
as $$
  select e.*
    from public.events e
    left join public.notification_processed_events p on p.event_id = e.id
   where p.event_id is null
   order by e.occurred_at asc, e.id asc
   limit greatest(1, least(p_limit, 500));
$$;

revoke execute on function public.get_unprocessed_notification_events(integer) from public, anon, authenticated;
grant execute on function public.get_unprocessed_notification_events(integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Push subscriptions
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.push_subscriptions (
  id               uuid        primary key default gen_random_uuid(),
  clerk_user_id    text        not null,
  endpoint         text        not null unique,
  -- Subscription keys are secrets-equivalent: this table has NO anon or
  -- authenticated SELECT policy (owner mutations go through server actions on
  -- the service role), and the application never logs them.
  p256dh           text        not null,
  auth             text        not null,
  user_agent       text,
  locale           text,
  timezone         text,
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  failure_count    integer     not null default 0,
  revoked_at       timestamptz
);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions (clerk_user_id) where revoked_at is null;

alter table public.push_subscriptions enable row level security;
-- Service-role only (see keys note above); ownership is enforced in the
-- server actions by the verified auth().userId.

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Email suppression (bounces / complaints)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.email_suppressions (
  id           uuid        primary key default gen_random_uuid(),
  -- Lower-cased address; unique so repeat webhooks are idempotent.
  email        text        not null unique,
  reason       text        not null check (reason in ('hard_bounce', 'complaint', 'manual', 'invalid')),
  source       text,
  created_at   timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
-- Service-role only: checked by the email channel before every submission.

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Digest membership
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.digest_memberships (
  id                      uuid        primary key default gen_random_uuid(),
  recipient_clerk_user_id text        not null,
  cadence                 text        not null check (cadence in ('daily', 'weekly')),
  category                text        not null,
  event_id                uuid        not null references public.events(id) on delete cascade,
  -- The delivery row whose intent this membership came from (for rendering).
  delivery_id             uuid        references public.notification_deliveries(id) on delete cascade,
  status                  text        not null default 'queued'
                            check (status in ('queued', 'sent', 'cancelled')),
  -- Stamped when a digest send consumes this row; the sending digest's
  -- delivery id groups the batch (audit: which events a digest represented).
  digest_delivery_id      uuid        references public.notification_deliveries(id) on delete set null,
  created_at              timestamptz not null default now(),
  sent_at                 timestamptz,
  -- An event can enter a recipient's digest exactly once per cadence — it can
  -- never reappear across windows.
  constraint digest_memberships_unique unique (recipient_clerk_user_id, cadence, event_id)
);

-- Matches the actual due-queue read: WHERE cadence=? AND status='queued'
-- ORDER BY created_at (grouping by recipient happens in the app).
create index if not exists idx_digest_memberships_due
  on public.digest_memberships (cadence, status, created_at)
  where status = 'queued';

alter table public.digest_memberships enable row level security;
-- Service-role only.

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Engine preferences (typed, per-user; supersedes the 019 seeker email
--    booleans without removing them)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.notification_engine_prefs (
  clerk_user_id      text        primary key,
  -- Global per-channel master switches.
  email_enabled      boolean     not null default true,
  push_enabled       boolean     not null default false, -- push is opt-IN (permission UX)
  in_app_enabled     boolean     not null default true,
  -- Per-category overrides: { "<category>": { "email": "immediate"|"daily"|
  -- "weekly"|"off", "push": "immediate"|"off", "in_app": "on"|"off" } }.
  -- Absent category → sane defaults in code (contracts DEFAULT_CATEGORY_PREFS).
  category_prefs     jsonb       not null default '{}'::jsonb,
  -- Quiet hours in the USER'S timezone (IANA). Overnight ranges supported
  -- (start > end). Null timezone → quiet hours disabled deterministically.
  quiet_hours_enabled boolean    not null default false,
  quiet_start_minute  integer    check (quiet_start_minute between 0 and 1439),
  quiet_end_minute    integer    check (quiet_end_minute between 0 and 1439),
  timezone            text,
  -- BCP-47 locale for rendering outbound notifications; null → default locale.
  locale              text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.notification_engine_prefs enable row level security;

-- Owners may read their own prefs; writes go through server actions (service
-- role) so preference changes are always server-validated.
drop policy if exists notification_engine_prefs_select_own on public.notification_engine_prefs;
create policy notification_engine_prefs_select_own on public.notification_engine_prefs
  for select to authenticated
  using (clerk_user_id = public.get_clerk_user_id());

-- NOTE: notifications.dedupe_key + its partial UNIQUE index already exist
-- (migration 008: idx_notifications_dedupe_key) — the engine's idempotent
-- in-app inserts ride that existing constraint; nothing to add here.

/* ------------------------------------------------------------------------ */
/* §7  Widen the in-app notification-center category CHECK                   */
/* ------------------------------------------------------------------------ */
-- The engine introduces 'matches' (strong matches, saved searches) and
-- 'messages' buckets in the notification center. Widening a CHECK is purely
-- additive: every existing row stays valid and existing writers are
-- unaffected. Mirrors contracts enums.ts NOTIFICATION_CATEGORY.

-- NOT VALID + VALIDATE: adding a plain CHECK would re-validate every existing
-- row under an ACCESS EXCLUSIVE lock on the live notifications table.
-- NOT VALID makes the swap instant; VALIDATE then only takes SHARE UPDATE
-- EXCLUSIVE (concurrent reads/writes unblocked) while proving the superset.
alter table public.notifications
  drop constraint if exists notifications_category_check;
alter table public.notifications
  add constraint notifications_category_check check (
    category in (
      'applications', 'offers', 'invites', 'matches', 'messages', 'billing',
      'safety', 'community', 'scheduling', 'verification', 'refunds', 'system'
    )
  ) not valid;
alter table public.notifications
  validate constraint notifications_category_check;

commit;
