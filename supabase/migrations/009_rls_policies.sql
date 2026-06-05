-- 009_rls_policies.sql
-- Explore&Earn — Migrations V1 · Row Level Security (RLS) foundation
--
-- GATE: permissions — FOUNDER APPROVAL REQUIRED.
--   See docs/agents/founder-approval-gates.md and the founder-approval-queue
--   row A-RLS-001. This migration is REVIEW-ONLY and MUST NOT be applied
--   (`supabase db push`) until the founder resolves the permissions gate.
--
-- Purpose: enable Row Level Security on all 24 tables created in migrations
-- 001-008 and add minimum-viable policies. Today every table has RLS DISABLED,
-- so the public anon key can read or write every row (issue #105 §3). This
-- migration closes that critical gap.
--
-- ============================================================================
-- ⚠️ OPEN QUESTIONS / BLOCKERS FOR REVIEW (do NOT approve until resolved)
-- ============================================================================
-- 1. IDENTITY MODEL MISMATCH (critical).
--    Migrations 002-008 bind identity to auth.users(id) — a uuid (the Supabase
--    Auth model). The locked stack decision D013 (issue #105 §1) moves auth to
--    Clerk, whose JWT `sub` claim is a TEXT id (e.g. "user_2ab..."), not a
--    uuid. The Clerk wiring (issue #105 Assignments 2 & 3, including the
--    `clerk_user_id` columns the user-sync webhook expects) is NOT yet merged,
--    so:
--      • There are no `clerk_user_id` columns in the live schema.
--      • The per-table spec names (`clerk_user_id`, `host_id`, `seeker_id`,
--        `actor_id`) do NOT match the real columns (`id`, `user_id`,
--        `owner_user_id`, `host_profile_id`, `seeker_profile_id`,
--        `actor_user_id`).
--    This migration is written against the REAL columns via the
--    requesting_user_id() helper below, which reads the JWT `sub` claim and
--    casts it to uuid. That is correct ONLY if `sub` is the auth.users uuid
--    (Supabase Auth, or a Clerk JWT template mapped to the shadow uuid). If
--    Clerk emits its native text sub, the schema must first gain
--    `clerk_user_id text` columns (Assignment 3) and these policies must be
--    rewritten as text joins. DECIDE THIS before approving.
-- 2. LISTINGS PUBLIC-READ STATUS. The spec says anon may read
--    status = 'published', but listings.status has no 'published' value; the
--    enum is draft/under_review/live/paused/closed/archived. This migration
--    treats status = 'live' as the public-readable state. Confirm.
-- 3. ADMIN / PLATFORM ACCESS. These minimum-viable policies intentionally do
--    NOT grant admin/platform override paths. They preserve the existing
--    G2 / G16 SECURITY DEFINER trigger invariants (host attestation_status and
--    lifecycle transitions keep working). Admin tooling and column-level write
--    restrictions are a follow-up policy set.
-- 4. MEDIA OWNERSHIP. media_buckets uses polymorphic (owner_type, owner_id)
--    with no user column, so writes are left default-deny (service role only)
--    and reads are scoped by visibility. A dedicated owner resolver is a
--    follow-up.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Identity helper
-- ---------------------------------------------------------------------------
-- Returns the requesting user's auth.users.id from the JWT `sub` claim, per
-- issue #105 §3:  (current_setting('request.jwt.claims', true)::jsonb) ->> 'sub'
-- STABLE + schema-qualified. Returns NULL when unauthenticated, so every
-- `col = requesting_user_id()` comparison fails closed (deny) for the anon role.
-- See open question #1 re: the uuid-vs-text sub assumption.
create or replace function public.requesting_user_id()
returns uuid
language sql
stable
as $$
  select nullif(
    (current_setting('request.jwt.claims', true)::jsonb) ->> 'sub',
    ''
  )::uuid;
$$;

comment on function public.requesting_user_id() is
  'Requesting user''s auth.users.id from the JWT sub claim. See 009 header '
  'open-question #1: assumes a uuid-shaped sub (Supabase Auth / mapped Clerk).';

-- ===========================================================================
-- 001 — lifecycle_transition (read-only lookup table)
-- ===========================================================================
alter table public.lifecycle_transition enable row level security;

create policy lifecycle_transition_read_all
  on public.lifecycle_transition
  for select to anon, authenticated
  using (true);

-- ===========================================================================
-- 002 — users_profile_shadow (auth only, own row: id = auth.users.id)
-- ===========================================================================
alter table public.users_profile_shadow enable row level security;

create policy users_profile_shadow_select_own
  on public.users_profile_shadow
  for select to authenticated
  using (id = public.requesting_user_id());

create policy users_profile_shadow_update_own
  on public.users_profile_shadow
  for update to authenticated
  using (id = public.requesting_user_id())
  with check (id = public.requesting_user_id());
-- INSERT is intentionally omitted: the shadow row is created by the Clerk
-- user-sync webhook (Assignment 3) running with the service role.

-- ===========================================================================
-- 003 — seeker_profiles / host_profiles / attestation_policy /
--       host_attestations / team_memberships
-- ===========================================================================

-- seeker_profiles: auth only, own (user_id). Host visibility is a follow-up.
alter table public.seeker_profiles enable row level security;

create policy seeker_profiles_select_own
  on public.seeker_profiles
  for select to authenticated
  using (user_id = public.requesting_user_id());

create policy seeker_profiles_insert_own
  on public.seeker_profiles
  for insert to authenticated
  with check (user_id = public.requesting_user_id());

create policy seeker_profiles_update_own
  on public.seeker_profiles
  for update to authenticated
  using (user_id = public.requesting_user_id())
  with check (user_id = public.requesting_user_id());

-- host_profiles: anon SELECT (public host pages); auth INSERT/UPDATE own
-- (owner_user_id). attestation_status/account_status writes remain guarded by
-- the G2/G16 SECURITY DEFINER triggers from migration 003 (see open Q #3).
alter table public.host_profiles enable row level security;

create policy host_profiles_read_all
  on public.host_profiles
  for select to anon, authenticated
  using (true);

create policy host_profiles_insert_own
  on public.host_profiles
  for insert to authenticated
  with check (owner_user_id = public.requesting_user_id());

create policy host_profiles_update_own
  on public.host_profiles
  for update to authenticated
  using (owner_user_id = public.requesting_user_id())
  with check (owner_user_id = public.requesting_user_id());

-- attestation_policy: anon SELECT (founder-published lookup content).
alter table public.attestation_policy enable row level security;

create policy attestation_policy_read_all
  on public.attestation_policy
  for select to anon, authenticated
  using (true);

-- host_attestations: host-owner INSERT only; host-owner SELECT.
alter table public.host_attestations enable row level security;

create policy host_attestations_select_own_host
  on public.host_attestations
  for select to authenticated
  using (
    exists (
      select 1 from public.host_profiles hp
      where hp.id = host_attestations.host_profile_id
        and hp.owner_user_id = public.requesting_user_id()
    )
  );

create policy host_attestations_insert_own_host
  on public.host_attestations
  for insert to authenticated
  with check (
    attested_by_user_id = public.requesting_user_id()
    and exists (
      select 1 from public.host_profiles hp
      where hp.id = host_attestations.host_profile_id
        and hp.owner_user_id = public.requesting_user_id()
    )
  );

-- team_memberships: member can read own row; host owner manages the team.
alter table public.team_memberships enable row level security;

create policy team_memberships_select_member_or_owner
  on public.team_memberships
  for select to authenticated
  using (
    user_id = public.requesting_user_id()
    or exists (
      select 1 from public.host_profiles hp
      where hp.id = team_memberships.host_profile_id
        and hp.owner_user_id = public.requesting_user_id()
    )
  );

create policy team_memberships_insert_owner
  on public.team_memberships
  for insert to authenticated
  with check (
    exists (
      select 1 from public.host_profiles hp
      where hp.id = team_memberships.host_profile_id
        and hp.owner_user_id = public.requesting_user_id()
    )
  );

create policy team_memberships_update_owner
  on public.team_memberships
  for update to authenticated
  using (
    exists (
      select 1 from public.host_profiles hp
      where hp.id = team_memberships.host_profile_id
        and hp.owner_user_id = public.requesting_user_id()
    )
  )
  with check (
    exists (
      select 1 from public.host_profiles hp
      where hp.id = team_memberships.host_profile_id
        and hp.owner_user_id = public.requesting_user_id()
    )
  );

create policy team_memberships_delete_owner
  on public.team_memberships
  for delete to authenticated
  using (
    exists (
      select 1 from public.host_profiles hp
      where hp.id = team_memberships.host_profile_id
        and hp.owner_user_id = public.requesting_user_id()
    )
  );

-- ===========================================================================
-- 004 — seeker resume tables (auth only, own via seeker_profiles.user_id)
-- ===========================================================================

create or replace function public.owns_seeker_profile(p_seeker_profile_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.seeker_profiles sp
    where sp.id = p_seeker_profile_id
      and sp.user_id = public.requesting_user_id()
  );
$$;

alter table public.seeker_resume_experiences enable row level security;
create policy seeker_resume_experiences_all_own
  on public.seeker_resume_experiences
  for all to authenticated
  using (public.owns_seeker_profile(seeker_profile_id))
  with check (public.owns_seeker_profile(seeker_profile_id));

alter table public.seeker_resume_educations enable row level security;
create policy seeker_resume_educations_all_own
  on public.seeker_resume_educations
  for all to authenticated
  using (public.owns_seeker_profile(seeker_profile_id))
  with check (public.owns_seeker_profile(seeker_profile_id));

alter table public.seeker_certifications enable row level security;
create policy seeker_certifications_all_own
  on public.seeker_certifications
  for all to authenticated
  using (public.owns_seeker_profile(seeker_profile_id))
  with check (public.owns_seeker_profile(seeker_profile_id));

-- ===========================================================================
-- 005 — media_buckets / media_assets
-- ===========================================================================

-- media_buckets: polymorphic ownership (owner_type, owner_id) — see open Q #4.
-- Minimum-viable: read by visibility; writes default-deny (service role only).
alter table public.media_buckets enable row level security;

create policy media_buckets_select_public
  on public.media_buckets
  for select to anon
  using (visibility = 'public');

create policy media_buckets_select_authenticated
  on public.media_buckets
  for select to authenticated
  using (visibility in ('public', 'authenticated'));

-- media_assets: auth only, own (uploaded_by_user_id). Public read of approved
-- listing imagery is a follow-up (needs the bucket-visibility join).
alter table public.media_assets enable row level security;

create policy media_assets_all_own
  on public.media_assets
  for all to authenticated
  using (uploaded_by_user_id = public.requesting_user_id())
  with check (uploaded_by_user_id = public.requesting_user_id());

-- ===========================================================================
-- 006 — listings / listing_relevance_extensions / listing_media_overrides
-- ===========================================================================

create or replace function public.owns_host_profile(p_host_profile_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.host_profiles hp
    where hp.id = p_host_profile_id
      and hp.owner_user_id = public.requesting_user_id()
  );
$$;

create or replace function public.owns_listing(p_listing_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.listings l
    join public.host_profiles hp on hp.id = l.host_profile_id
    where l.id = p_listing_id
      and hp.owner_user_id = public.requesting_user_id()
  );
$$;

-- listings: anon + auth read of live listings; host owner reads any status and
-- manages own listings. (Spec said 'published'; schema uses 'live' — open Q #2.)
alter table public.listings enable row level security;

create policy listings_select_live
  on public.listings
  for select to anon, authenticated
  using (status = 'live');

create policy listings_select_own_host
  on public.listings
  for select to authenticated
  using (public.owns_host_profile(host_profile_id));

create policy listings_insert_own_host
  on public.listings
  for insert to authenticated
  with check (public.owns_host_profile(host_profile_id));

create policy listings_update_own_host
  on public.listings
  for update to authenticated
  using (public.owns_host_profile(host_profile_id))
  with check (public.owns_host_profile(host_profile_id));

create policy listings_delete_own_host
  on public.listings
  for delete to authenticated
  using (public.owns_host_profile(host_profile_id));

-- listing_relevance_extensions: public read when the parent listing is live;
-- host owner manages.
alter table public.listing_relevance_extensions enable row level security;

create policy listing_relevance_extensions_select_live
  on public.listing_relevance_extensions
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_relevance_extensions.listing_id
        and l.status = 'live'
    )
  );

create policy listing_relevance_extensions_manage_own
  on public.listing_relevance_extensions
  for all to authenticated
  using (public.owns_listing(listing_id))
  with check (public.owns_listing(listing_id));

-- listing_media_overrides: public read when the parent listing is live; host
-- owner manages.
alter table public.listing_media_overrides enable row level security;

create policy listing_media_overrides_select_live
  on public.listing_media_overrides
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_media_overrides.listing_id
        and l.status = 'live'
    )
  );

create policy listing_media_overrides_manage_own
  on public.listing_media_overrides
  for all to authenticated
  using (public.owns_listing(listing_id))
  with check (public.owns_listing(listing_id));

-- ===========================================================================
-- 007 — applications / invites / offers / saved_listings /
--       host_seeker_dispositions
-- ===========================================================================

-- applications: seeker owner + host of the listing can read; seeker inserts
-- own; both sides may update (status transitions are guarded by the G16
-- lifecycle trigger from migration 007).
alter table public.applications enable row level security;

create policy applications_select_seeker_or_host
  on public.applications
  for select to authenticated
  using (
    public.owns_seeker_profile(seeker_profile_id)
    or public.owns_listing(listing_id)
  );

create policy applications_insert_own_seeker
  on public.applications
  for insert to authenticated
  with check (public.owns_seeker_profile(seeker_profile_id));

create policy applications_update_seeker_or_host
  on public.applications
  for update to authenticated
  using (
    public.owns_seeker_profile(seeker_profile_id)
    or public.owns_listing(listing_id)
  )
  with check (
    public.owns_seeker_profile(seeker_profile_id)
    or public.owns_listing(listing_id)
  );

-- invites: host owner manages; seeker can read invites addressed to them.
alter table public.invites enable row level security;

create policy invites_select_host_or_seeker
  on public.invites
  for select to authenticated
  using (
    public.owns_host_profile(host_profile_id)
    or public.owns_seeker_profile(seeker_profile_id)
  );

create policy invites_insert_own_host
  on public.invites
  for insert to authenticated
  with check (public.owns_host_profile(host_profile_id));

create policy invites_update_host_or_seeker
  on public.invites
  for update to authenticated
  using (
    public.owns_host_profile(host_profile_id)
    or public.owns_seeker_profile(seeker_profile_id)
  )
  with check (
    public.owns_host_profile(host_profile_id)
    or public.owns_seeker_profile(seeker_profile_id)
  );

create policy invites_delete_own_host
  on public.invites
  for delete to authenticated
  using (public.owns_host_profile(host_profile_id));

-- offers: host owner creates/manages; seeker can read and respond (status
-- transitions guarded by the G16 lifecycle trigger).
alter table public.offers enable row level security;

create policy offers_select_host_or_seeker
  on public.offers
  for select to authenticated
  using (
    public.owns_host_profile(host_profile_id)
    or public.owns_seeker_profile(seeker_profile_id)
  );

create policy offers_insert_own_host
  on public.offers
  for insert to authenticated
  with check (public.owns_host_profile(host_profile_id));

create policy offers_update_host_or_seeker
  on public.offers
  for update to authenticated
  using (
    public.owns_host_profile(host_profile_id)
    or public.owns_seeker_profile(seeker_profile_id)
  )
  with check (
    public.owns_host_profile(host_profile_id)
    or public.owns_seeker_profile(seeker_profile_id)
  );

-- saved_listings: seeker owner only (full access to own bookmarks).
alter table public.saved_listings enable row level security;

create policy saved_listings_all_own_seeker
  on public.saved_listings
  for all to authenticated
  using (public.owns_seeker_profile(seeker_profile_id))
  with check (public.owns_seeker_profile(seeker_profile_id));

-- host_seeker_dispositions: host owner only (host's private pipeline board).
alter table public.host_seeker_dispositions enable row level security;

create policy host_seeker_dispositions_all_own_host
  on public.host_seeker_dispositions
  for all to authenticated
  using (public.owns_host_profile(host_profile_id))
  with check (public.owns_host_profile(host_profile_id));

-- ===========================================================================
-- 008 — event_types / events / notifications / notification_preferences
-- ===========================================================================

-- event_types: anon SELECT (read-only seeded registry).
alter table public.event_types enable row level security;

create policy event_types_read_all
  on public.event_types
  for select to anon, authenticated
  using (true);

-- events: auth INSERT own (actor_user_id); NO SELECT (append-only audit log).
alter table public.events enable row level security;

create policy events_insert_own_actor
  on public.events
  for insert to authenticated
  with check (actor_user_id = public.requesting_user_id());
-- No SELECT/UPDATE/DELETE policy: the log is append-only and not client-readable.

-- notifications: recipient owner reads/updates own notifications. INSERT is
-- service-role only (system-generated), so no insert policy.
alter table public.notifications enable row level security;

create policy notifications_select_own
  on public.notifications
  for select to authenticated
  using (recipient_user_id = public.requesting_user_id());

create policy notifications_update_own
  on public.notifications
  for update to authenticated
  using (recipient_user_id = public.requesting_user_id())
  with check (recipient_user_id = public.requesting_user_id());

-- notification_preferences: auth only, own user row (full access).
alter table public.notification_preferences enable row level security;

create policy notification_preferences_all_own
  on public.notification_preferences
  for all to authenticated
  using (user_id = public.requesting_user_id())
  with check (user_id = public.requesting_user_id());

-- End of 009_rls_policies.sql (review-only — do not apply; permissions gate).
