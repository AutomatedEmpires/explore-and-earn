-- Migration 066: RLS write policies for seeker/host lifecycle mutations.
--
-- PROBLEM (verified against the live database 2026-07-16, pg_policies):
-- applications has seeker SELECT+INSERT and host SELECT+UPDATE policies (013),
-- but NO seeker UPDATE policy; invites and offers have SELECT-only policies
-- (015, whose comment assumed "Writes are server-side"). In reality every
-- seeker-side lifecycle write runs under the seeker's own Clerk JWT via
-- authedClient (anon key + RLS):
--
--   * withdrawApplication            (applications: applied/reviewing/saved_by_host -> withdrawn)
--   * applyToListing reactivation    (applications: withdrawn -> applied, migration 063)
--   * updateApplicationStatusBySeeker(applications: offered -> accepted | withdrawn)
--   * respondToInvite                (invites: created/delivered/viewed -> applied | ignored)
--   * withdrawInvite  [host]         (invites: created/delivered/viewed -> withdrawn)
--
-- With no UPDATE policy, PostgREST filters each UPDATE to zero rows and the
-- calls "succeed" without changing anything — the entire seeker half of the
-- application lifecycle is a silent no-op in production (undiscovered only
-- because the tables are still empty). The companion code change adds
-- affected-row assertions so a filtered write can never again report ok:true.
--
-- SCOPE OF EACH POLICY: ownership + the exact status windows the product
-- allows that actor to touch. Which EDGE a transition takes stays enforced by
-- the trg_applications_lifecycle / trg_invites_lifecycle BEFORE UPDATE
-- triggers (001); these policies add the actor dimension the triggers cannot
-- see. The offers table stays SELECT-only: it has no writer anywhere in the
-- codebase (offer state is modeled on applications.status='offered'), so
-- granting writes to a dead table would only widen attack surface.
--
-- Additive + idempotent. Apply via the db-migrate pipeline on merge — never
-- by an agent.

-- Seeker updates their own application rows, only out of / into the states a
-- seeker action can legitimately touch:
--   withdraw:    applied|reviewing|saved_by_host -> withdrawn
--   reactivate:  withdrawn -> applied            (063 re-apply)
--   offer reply: offered -> accepted | withdrawn (decline = withdrawn +
--                withdrawn_reason='seeker_declined_offer')
drop policy if exists applications_update_seeker on public.applications;
create policy applications_update_seeker on public.applications
  for update to authenticated
  using (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    and status in ('applied', 'reviewing', 'saved_by_host', 'offered', 'withdrawn')
  )
  with check (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    and status in ('applied', 'withdrawn', 'accepted')
  );

-- Seeker responds to an invite addressed to them (respondToInvite walks
-- created -> delivered -> applied, or -> ignored). Never withdrawn/expired —
-- those are host/system outcomes.
drop policy if exists invites_update_seeker on public.invites;
create policy invites_update_seeker on public.invites
  for update to authenticated
  using (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    and status in ('created', 'delivered', 'viewed')
  )
  with check (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    and status in ('delivered', 'viewed', 'applied', 'ignored')
  );

-- Host retracts their own still-pending invite (withdrawInvite). The invite
-- credit-restore policy keys off which status window matched; the WHERE
-- clauses in withdrawInvite stay authoritative — this policy only opens the
-- host's own pending rows.
drop policy if exists invites_update_host on public.invites;
create policy invites_update_host on public.invites
  for update to authenticated
  using (
    host_profile_id in (select public.current_host_profile_ids())
    and status in ('created', 'delivered', 'viewed')
  )
  with check (
    host_profile_id in (select public.current_host_profile_ids())
    and status = 'withdrawn'
  );
