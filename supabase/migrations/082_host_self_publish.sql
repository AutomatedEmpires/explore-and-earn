-- 082_host_self_publish.sql
--
-- HOSTS PUBLISH THEIR OWN LISTINGS (founder, 2026-07-26).
--
-- ── WHAT WAS BROKEN ──────────────────────────────────────────────────────────
-- No host-controlled listing could EVER reach `live`. Three layers agreed on it:
--
--   * canTransitionListing (queries/listingLifecycle.ts) had draft->under_review
--     and under_review->draft, and deliberately no under_review->live edge.
--   * 077's trigger refused any authenticated move into live except paused->live.
--   * the ONLY application call that ever set 'live' was resumeListingAction,
--     i.e. paused->live — a state a host could not reach in the first place.
--
-- The admin approval that was supposed to close the loop (adminApproveListing)
-- is a service-role update with no queue, no notification and no operator
-- process behind it. So the founder's decision is to delete the approval step
-- rather than staff it: the host publishes, and moderation stays REACTIVE
-- (admin hold/close, the report flow, the freshness sweeps) instead of being a
-- gate nobody is standing at.
--
-- ── WHAT THIS DOES NOT CHANGE ────────────────────────────────────────────────
-- The quality floor is untouched. 070's listings_publication_triad_chk still
-- refuses `under_review` and `live` for any non-sourced listing whose Housing,
-- Meals or Pay evidence is not 'confirmed', or that carries no pay figure. 072's
-- trg_listings_housing_photos still demands the four housing photo roles at both
-- publication statuses. Removing the human approver does not remove the
-- database's refusal to publish a listing that says nothing.
--
-- Nor does it change how a listing STARTS: an authenticated direct INSERT must
-- still be a draft, so nobody skips the floor by creating a live row outright.
-- draft->live is likewise still refused — publication remains a deliberate
-- second act, and it is the transition 070 and 072 are attached to.
--
-- ── closed -> draft ──────────────────────────────────────────────────────────
-- `closed` had no exit at all: canTransitionListing mapped it to [], and 077
-- refused every move out of it. A closed listing was a permanent orphan.
--
-- Three actors write 'closed', and they are not the same kind of event:
--
--   1. adminCloseListing (queries/admin.ts) — an operator rejecting a listing
--      that was awaiting review. THIS is the one that needs reversing: the host
--      fixed whatever was wrong and has nowhere to put the fix.
--   2. sweepStaleSourcedListings (queries/sourcedFreshness.ts) — a sourced
--      posting not seen at its source for SOURCED_STALE_DAYS.
--   3. the full-snapshot reconciliation in queries/sourcedListings.ts — a
--      sourced posting that has disappeared from the source entirely.
--
-- (2) and (3) are the ingestion lifecycle recording that the ORIGIN withdrew the
-- posting. Letting anyone hand-reopen those would resurrect, under Explore &
-- Earn's own source attribution, a job the source itself took down. Both act
-- only on provenance='sourced' rows, so the split is exact: closed->draft is
-- permitted for a verified listing and refused for a sourced one.
--
-- A sourced row can legitimately be host-owned (064 relaxed host_profile_id and
-- a claim attaches a host before conversion), so this is not theoretical —
-- listings_update_own would let that host make the move if the trigger allowed
-- it. Both OLD and NEW provenance are tested: 071 does not grant `provenance` to
-- `authenticated`, so the two are always equal on this path, but a gate that
-- reads only one side is one grant away from being an escape hatch, and that is
-- exactly the shape 071 was written to close.
--
-- Additive/idempotent: replaces one function body and re-creates its trigger.
-- No data is read or rewritten, no constraint is relaxed, no grant changes.

begin;

create or replace function private.enforce_listing_host_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_is_authenticated_request boolean :=
    current_user = 'authenticated'
    or coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
begin
  if not v_is_authenticated_request then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception using
        errcode = '23514',
        message = 'listing_initial_status_must_be_draft';
    end if;
    return new;
  end if;

  -- Ordinary edits do not change lifecycle state and remain host-writable.
  if new.status is not distinct from old.status then
    return new;
  end if;

  if (old.status = 'draft' and new.status = 'under_review')
    or (old.status = 'under_review' and new.status in ('draft', 'live'))
    or (old.status = 'live' and new.status in ('paused', 'archived'))
    or (old.status = 'paused' and new.status in ('live', 'archived')) then
    return new;
  end if;

  -- Reopening an operator-closed listing. Refused for sourced inventory: there
  -- the closure means the ORIGIN withdrew the posting, not that a host has a
  -- correction to make.
  if old.status = 'closed'
    and new.status = 'draft'
    and old.provenance is distinct from 'sourced'
    and new.provenance is distinct from 'sourced' then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = 'listing_host_status_transition_forbidden',
    detail = format('authenticated host cannot move listing from %s to %s', old.status, new.status);
end;
$$;

revoke execute on function private.enforce_listing_host_status_transition()
  from public, anon, authenticated;

drop trigger if exists trg_listings_host_status_transition on public.listings;
create trigger trg_listings_host_status_transition
  before insert or update on public.listings
  for each row
  execute function private.enforce_listing_host_status_transition();

comment on function private.enforce_listing_host_status_transition() is
  'Database backstop for the host listing lifecycle. Authenticated inserts start in draft; authenticated updates follow only the canonical host transition graph, which since 082 includes under_review->live (hosts publish their own listings, founder 2026-07-26) and closed->draft for verified listings only. The publication floor is elsewhere and unchanged: 070''s triad CHECK and 072''s housing-photo trigger both still gate under_review and live. Trusted service-role moderation is unaffected.';

commit;
