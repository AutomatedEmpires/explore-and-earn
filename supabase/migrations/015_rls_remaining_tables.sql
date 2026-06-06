-- =====================================================================
-- 015_rls_remaining_tables.sql
-- explore&earn — extend Row Level Security to the 16 public tables left
-- open after the 013 RLS rollout (the tables the Supabase security
-- advisor still reports as RLS-disabled).
--
-- Design:
--   * Clerk-keyed, reusing ONLY the helper functions that actually exist
--     in the live lineage from 013:
--       get_clerk_user_id(), current_seeker_profile_ids(),
--       current_host_profile_ids(), current_host_listing_ids(),
--       current_conversation_ids()
--     An earlier draft referenced owns_listing(uuid), is_seeker_profile_owner(uuid),
--     is_host_profile_owner(uuid), is_conversation_participant(uuid) and
--     host_has_live_listing(uuid). Those predicate helpers were never
--     committed and DO NOT exist in the database (verified against the live
--     catalog: information_schema.routines returned none of them). Every
--     ownership check is therefore expressed inline as set-membership
--     against the existing current_*_ids() helpers, e.g.
--       owns_listing(listing_id)
--         -> listing_id in (select public.current_host_listing_ids())
--   * service_role bypasses RLS, so server-side reads/writes are
--     unaffected. This migration only closes the anon/authenticated hole.
--   * Expand/contract safe: enables RLS + adds policies only; no data or
--     column changes.
--
-- DEPENDS ON: the 013 RLS rollout (current_*_ids()/get_clerk_user_id()
-- helpers + core-table policies). That rollout is applied to the live DB
-- but is not yet committed to main — repo<->DB drift to reconcile
-- separately (see PR #138 discussion).
-- =====================================================================

-- 1) Enable RLS on the 16 remaining public tables
alter table public.lifecycle_transition          enable row level security;
alter table public.event_types                   enable row level security;
alter table public.attestation_policy            enable row level security;
alter table public.users_profile_shadow          enable row level security;
alter table public.team_memberships              enable row level security;
alter table public.host_attestations             enable row level security;
alter table public.host_seeker_dispositions      enable row level security;
alter table public.listing_relevance_extensions  enable row level security;
alter table public.listing_media_overrides       enable row level security;
alter table public.invites                       enable row level security;
alter table public.offers                        enable row level security;
alter table public.notifications                 enable row level security;
alter table public.notification_preferences      enable row level security;
alter table public.events                        enable row level security;
alter table public.media_buckets                 enable row level security;
alter table public.media_assets                  enable row level security;

-- 2) Public reference / config tables (read-only to everyone)
create policy lifecycle_transition_select_public on public.lifecycle_transition
  for select to anon, authenticated
  using (true);

create policy event_types_select_public on public.event_types
  for select to anon, authenticated
  using (true);

create policy attestation_policy_select_public on public.attestation_policy
  for select to anon, authenticated
  using (is_current = true);

-- 3) Public catalog extensions (visible only when parent listing is live)
create policy listing_relevance_extensions_select_public on public.listing_relevance_extensions
  for select to anon, authenticated
  using (
    display_enabled = true
    and exists (
      select 1 from public.listings l
      where l.id = listing_relevance_extensions.listing_id
        and l.status = 'live'
    )
  );

create policy listing_media_overrides_select_public on public.listing_media_overrides
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_media_overrides.listing_id
        and l.status = 'live'
    )
  );

-- Host owner manages the extensions/overrides for listings they own.
-- owns_listing(listing_id) -> listing_id in (select current_host_listing_ids())
create policy listing_relevance_extensions_all_own on public.listing_relevance_extensions
  for all to authenticated
  using (listing_id in (select public.current_host_listing_ids()))
  with check (listing_id in (select public.current_host_listing_ids()));

create policy listing_media_overrides_all_own on public.listing_media_overrides
  for all to authenticated
  using (listing_id in (select public.current_host_listing_ids()))
  with check (listing_id in (select public.current_host_listing_ids()));

-- 4) Host-owned operational tables
create policy host_attestations_all_own on public.host_attestations
  for all to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()))
  with check (host_profile_id in (select public.current_host_profile_ids()));

create policy host_seeker_dispositions_all_own on public.host_seeker_dispositions
  for all to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()))
  with check (host_profile_id in (select public.current_host_profile_ids()));

-- 5) team_memberships — host owner manages; member can read their own row
create policy team_memberships_all_host on public.team_memberships
  for all to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()))
  with check (host_profile_id in (select public.current_host_profile_ids()));

create policy team_memberships_select_self on public.team_memberships
  for select to authenticated
  using (
    user_id in (
      select s.id from public.users_profile_shadow s
      where s.clerk_user_id = public.get_clerk_user_id()
    )
  );

-- 6) Two-party tables (seeker OR host party may read). Writes are server-side.
create policy invites_select_party on public.invites
  for select to authenticated
  using (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    or host_profile_id in (select public.current_host_profile_ids())
  );

create policy offers_select_party on public.offers
  for select to authenticated
  using (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    or host_profile_id in (select public.current_host_profile_ids())
  );

-- 7) Recipient-scoped notifications (recipient_clerk_user_id added by 014)
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_clerk_user_id = public.get_clerk_user_id());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_clerk_user_id = public.get_clerk_user_id())
  with check (recipient_clerk_user_id = public.get_clerk_user_id());

create policy notification_preferences_all_own on public.notification_preferences
  for all to authenticated
  using (
    user_id in (
      select s.id from public.users_profile_shadow s
      where s.clerk_user_id = public.get_clerk_user_id()
    )
  )
  with check (
    user_id in (
      select s.id from public.users_profile_shadow s
      where s.clerk_user_id = public.get_clerk_user_id()
    )
  );

-- 8) users_profile_shadow — self read/update (sync writes are server-side)
create policy users_profile_shadow_select_own on public.users_profile_shadow
  for select to authenticated
  using (clerk_user_id = public.get_clerk_user_id());

create policy users_profile_shadow_update_own on public.users_profile_shadow
  for update to authenticated
  using (clerk_user_id = public.get_clerk_user_id())
  with check (clerk_user_id = public.get_clerk_user_id());

-- 9) Server-only tables — RLS ON, NO client policy (deny-by-default).
-- (intentionally no policies for: events, media_buckets, media_assets)

-- 10) Reduce the RPC surface on the RLS helper functions that exist.
revoke execute on function
  public.get_clerk_user_id(),
  public.current_seeker_profile_ids(),
  public.current_host_profile_ids(),
  public.current_host_listing_ids(),
  public.current_conversation_ids()
  from public;

grant execute on function
  public.get_clerk_user_id(),
  public.current_seeker_profile_ids(),
  public.current_host_profile_ids(),
  public.current_host_listing_ids(),
  public.current_conversation_ids()
  to authenticated, service_role;

-- =====================================================================
-- RESOLVED NOTES (review questions closed before apply)
-- ---------------------------------------------------------------------
-- R1 (events): Scanned the app for client-side writes to public.events
--     (.from("events").insert). None exist — events are written
--     server-side only. Kept deny-by-default, which also closes the
--     sensitive session_id exposure finding.
--
-- R2 (media): Scanned for client/anon reads of media_buckets / media_assets
--     (.from("media_buckets"), .from("media_assets")). None exist in the
--     app — these tables are referenced only by SQL migrations and the
--     generated DB types; media is served outside the anon PostgREST path.
--     Kept deny-by-default; no public SELECT policy added.
--
-- R3 (shadow bridge): team_memberships self-read and
--     notification_preferences bridge a uuid user_id to the Clerk id via
--     public.users_profile_shadow. The Clerk webhook sync maintains a
--     shadow row per user, so the uuid->Clerk join resolves a user's own
--     rows. service_role sync writes are unaffected by RLS.
-- =====================================================================
