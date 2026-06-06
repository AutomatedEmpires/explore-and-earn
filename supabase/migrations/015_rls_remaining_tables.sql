-- =====================================================================
-- 015_rls_remaining_tables.sql
-- explore&earn — extend Row Level Security to the 16 public tables left
-- open after the 013_rls_policies / rls_policies rollout (the tables the
-- Supabase security advisor still reports as RLS-disabled).
--
-- Design:
--   * Clerk-keyed, reusing the helper functions created in 013:
--       get_clerk_user_id(), current_seeker_profile_ids(),
--       current_host_profile_ids(), current_host_listing_ids(),
--       current_conversation_ids(), owns_listing(uuid),
--       is_seeker_profile_owner(uuid), is_host_profile_owner(uuid),
--       is_conversation_participant(uuid), host_has_live_listing(uuid)
--   * service_role bypasses RLS, so server-side writes/reads are
--     unaffected. This migration only closes the anon/authenticated hole.
--   * Expand/contract safe: enabling RLS + adding policies only; no data
--     or column changes.
--
-- DEPENDS ON: 013_rls_policies (helper functions + core-table policies).
-- That migration is applied to the live DB but is NOT yet committed to
-- main (see PR body — repo<->DB drift to reconcile).
--
-- DRAFT: do not apply until the founder permissions gate + Claude/CodeQL
-- review. Two tables (events, media_assets/media_buckets) are left
-- deny-by-default pending confirmation of their client fetch path — see
-- the OPEN QUESTIONS section at the bottom.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Enable RLS on the 16 remaining public tables
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 2) Public reference / config tables (read-only to everyone)
-- ---------------------------------------------------------------------
create policy lifecycle_transition_select_public on public.lifecycle_transition
  for select to anon, authenticated
  using (true);

create policy event_types_select_public on public.event_types
  for select to anon, authenticated
  using (true);

create policy attestation_policy_select_public on public.attestation_policy
  for select to anon, authenticated
  using (is_current = true);

-- ---------------------------------------------------------------------
-- 3) Public catalog extensions (visible only when parent listing is live)
-- ---------------------------------------------------------------------
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
create policy listing_relevance_extensions_all_own on public.listing_relevance_extensions
  for all to authenticated
  using (public.owns_listing(listing_id))
  with check (public.owns_listing(listing_id));

create policy listing_media_overrides_all_own on public.listing_media_overrides
  for all to authenticated
  using (public.owns_listing(listing_id))
  with check (public.owns_listing(listing_id));

-- ---------------------------------------------------------------------
-- 4) Host-owned operational tables
-- ---------------------------------------------------------------------
create policy host_attestations_all_own on public.host_attestations
  for all to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()))
  with check (host_profile_id in (select public.current_host_profile_ids()));

create policy host_seeker_dispositions_all_own on public.host_seeker_dispositions
  for all to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()))
  with check (host_profile_id in (select public.current_host_profile_ids()));

-- ---------------------------------------------------------------------
-- 5) team_memberships — host owner manages; member can read their own row
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 6) Two-party tables (seeker OR host party may read). Writes server-side.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 7) Recipient-scoped notifications
-- ---------------------------------------------------------------------
-- notifications carries a denormalized clerk id; key on it directly.
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_clerk_user_id = public.get_clerk_user_id());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_clerk_user_id = public.get_clerk_user_id())
  with check (recipient_clerk_user_id = public.get_clerk_user_id());

-- notification_preferences keys on a uuid; bridge via the shadow table.
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

-- ---------------------------------------------------------------------
-- 8) users_profile_shadow — self read/update (sync writes are server-side)
-- ---------------------------------------------------------------------
create policy users_profile_shadow_select_own on public.users_profile_shadow
  for select to authenticated
  using (clerk_user_id = public.get_clerk_user_id());

create policy users_profile_shadow_update_own on public.users_profile_shadow
  for update to authenticated
  using (clerk_user_id = public.get_clerk_user_id())
  with check (clerk_user_id = public.get_clerk_user_id());

-- ---------------------------------------------------------------------
-- 9) Server-only tables — RLS ON, NO client policy (deny-by-default).
--    service_role bypasses RLS, so server inserts/reads keep working.
--    * events: closes the sensitive session_id exposure.
--    * media_buckets / media_assets: see OPEN QUESTIONS before adding any
--      public-read policy.
-- ---------------------------------------------------------------------
-- (intentionally no policies for: events, media_buckets, media_assets)

-- ---------------------------------------------------------------------
-- 10) Reduce RPC surface on the RLS helper functions.
--     These are policy helpers. No anon-facing policy calls them, so anon
--     never needs EXECUTE. authenticated MUST keep EXECUTE because its
--     policies evaluate these functions at query time; service_role keeps
--     EXECUTE for server paths. (Addresses the anon-executable advisor
--     warning; the authenticated-executable warning is expected for
--     policy helpers.)
-- ---------------------------------------------------------------------
revoke execute on function
  public.get_clerk_user_id(),
  public.current_seeker_profile_ids(),
  public.current_host_profile_ids(),
  public.current_host_listing_ids(),
  public.current_conversation_ids(),
  public.owns_listing(uuid),
  public.is_seeker_profile_owner(uuid),
  public.is_host_profile_owner(uuid),
  public.is_conversation_participant(uuid),
  public.host_has_live_listing(uuid)
  from public;

grant execute on function
  public.get_clerk_user_id(),
  public.current_seeker_profile_ids(),
  public.current_host_profile_ids(),
  public.current_host_listing_ids(),
  public.current_conversation_ids(),
  public.owns_listing(uuid),
  public.is_seeker_profile_owner(uuid),
  public.is_host_profile_owner(uuid),
  public.is_conversation_participant(uuid),
  public.host_has_live_listing(uuid)
  to authenticated, service_role;

-- =====================================================================
-- OPEN QUESTIONS FOR REVIEW (do not merge until resolved)
-- ---------------------------------------------------------------------
-- Q1 (media): If public/live listing pages fetch media_assets or
--     media_buckets directly with the anon/authenticated key, the
--     deny-by-default above will break listing images. If so, add a
--     scoped public-read policy, e.g.:
--
--     -- create policy media_assets_select_public on public.media_assets
--     --   for select to anon, authenticated
--     --   using (exists (
--     --     select 1 from public.listing_media_overrides o
--     --     join public.listings l on l.id = o.listing_id
--     --     where o.media_asset_id = media_assets.id and l.status = 'live'
--     --   ));
--     -- create policy media_buckets_select_public on public.media_buckets
--     --   for select to anon, authenticated
--     --   using (visibility = 'public');
--
--     If media is only ever served through a server route / signed URLs,
--     keep deny-by-default as written.
--
-- Q2 (events): If product/analytics events are written from the client
--     with the anon/authenticated key, add an insert policy:
--
--     -- create policy events_insert_client on public.events
--     --   for insert to anon, authenticated with check (true);
--
--     If events are written server-side only, keep deny-by-default (this
--     also resolves the sensitive session_id exposure finding).
--
-- Q3 (team self-read / notification_preferences): both bridge a uuid
--     user_id to Clerk via users_profile_shadow. Confirm shadow rows are
--     always present at read time (Clerk webhook sync) so the join does
--     not silently hide a user's own rows.
-- =====================================================================
