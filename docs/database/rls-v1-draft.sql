-- ============================================================================
-- Explore&Earn — RLS POLICY V1 *DRAFT* (REVIEW ONLY) — DO NOT RUN
-- Posture: deny-by-default + FORCE; public read only via security_barrier views
-- (DR-B11). Mirrors the Permission, Visibility & RLS Registry.
-- ============================================================================

-- ---- helpers (read identity/role from app rows, not JWT claims — DR-B9) -----
create or replace function app_uid() returns uuid
  language sql stable as $$ select auth.uid() $$;

create or replace function app_is_admin() returns boolean
  language sql stable as $$
  select exists (select 1 from users u where u.id = auth.uid() and u.primary_scope = 'admin')
$$;

create or replace function app_is_team_member(p_host uuid, p_roles text[]) returns boolean
  language sql stable as $$
  select exists (
    select 1 from team_memberships m
    where m.host_id = p_host and m.user_id = auth.uid()
      and m.status = 'active'
      and (p_roles is null or m.role_preset = any(p_roles))
  )
$$;

-- ---- enable + FORCE on every user-facing table ----------------------------
-- (repeat for all tables; shown for the representative set)
alter table users               enable row level security;  alter table users               force row level security;
alter table seeker_profiles     enable row level security;  alter table seeker_profiles     force row level security;
alter table host_profiles       enable row level security;  alter table host_profiles       force row level security;
alter table host_attestations   enable row level security;  alter table host_attestations   force row level security;
alter table listings            enable row level security;  alter table listings            force row level security;
alter table applications        enable row level security;  alter table applications        force row level security;
alter table messages            enable row level security;  alter table messages            force row level security;
alter table media_assets        enable row level security;  alter table media_assets        force row level security;
alter table positive_reactions  enable row level security;  alter table positive_reactions  force row level security;
alter table service_credit_ledger enable row level security; alter table service_credit_ledger force row level security;

-- ---- seeker owns own profile ----------------------------------------------
create policy seeker_self_rw on seeker_profiles
  using (user_id = app_uid()) with check (user_id = app_uid());

-- ---- host team-scoped access to host profile ------------------------------
create policy host_team_read on host_profiles for select
  using (app_is_team_member(id, null) or app_is_admin());
create policy host_team_update on host_profiles for update
  using (app_is_team_member(id, array['owner','admin']))
  -- DR-B14/G3: the trust mirror is NEVER written here; only set_host_attestation() (security definer)
  with check (app_is_team_member(id, array['owner','admin']));
-- account_status / removed_* changes: admin only (enforced by a column-guard trigger + this policy)
create policy host_admin_state on host_profiles for update
  using (app_is_admin()) with check (app_is_admin());

-- ---- attestation write path (G2/G3): owner may INSERT; nobody UPDATE/DELETE -
create policy attest_insert on host_attestations for insert
  with check (app_is_team_member(host_id, array['owner','admin']));
-- no update/delete policies => append-only/immutable by deny-default

-- ---- listings: public read via VIEW only; team manages own ----------------
create policy listing_team_rw on listings
  using (app_is_team_member(host_id, array['owner','admin','hiring_manager']) or app_is_admin())
  with check (app_is_team_member(host_id, array['owner','admin','hiring_manager']));
-- (no anon policy on base table; anon reads public_listings_view)

-- ---- applications: seeker owns; host team of the listing can read ----------
create policy application_seeker on applications
  using (seeker_id in (select id from seeker_profiles where user_id = app_uid()))
  with check (seeker_id in (select id from seeker_profiles where user_id = app_uid()));
create policy application_host_read on applications for select
  using (exists (select 1 from listings l
                 where l.id = applications.listing_id
                   and app_is_team_member(l.host_id, array['owner','admin','hiring_manager'])));

-- ---- messages: participants only (G12); admin only via case context -------
create policy message_participant on messages
  using (exists (
    select 1 from conversation_threads t
    where t.id = messages.thread_id
      and ( t.seeker_id in (select id from seeker_profiles where user_id = app_uid())
         or app_is_team_member(t.host_id, null)
         or (app_is_admin() and t.context_type in ('dispute','support')) )
  ));

-- ---- media: pending media is NOT public (G10) -----------------------------
create policy media_owner on media_assets
  using (owner_user_id = app_uid()) with check (owner_user_id = app_uid());
-- public exposure is provided only through approved+public rows surfaced in views:
--   USING (moderation_status='approved' AND visibility IN ('authenticated','public'))

-- ---- community reactions: seekers only ------------------------------------
create policy reactions_seeker_only on positive_reactions for all
  using (exists (select 1 from users u where u.id = app_uid() and u.primary_scope = 'seeker'))
  with check (exists (select 1 from users u where u.id = app_uid() and u.primary_scope = 'seeker'));

-- ---- financial ledgers: host team (billing/owner) read; writes service-role only
create policy credit_ledger_read on service_credit_ledger for select
  using (app_is_team_member(host_id, array['owner','billing']) or app_is_admin());

-- coverage report → docs/sprint-zero/rls-coverage.md ; tests → supabase/tests/*.rls.sql
-- END DRAFT
