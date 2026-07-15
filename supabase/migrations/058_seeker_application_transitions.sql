-- Migration 058: RLS-safe seeker application transitions.
--
-- applications has RLS enabled, but migration 013 deliberately grants UPDATE
-- only to the host that owns the listing. A broad seeker UPDATE policy would
-- let a raw PostgREST caller modify unrelated application columns, so seeker
-- lifecycle writes remain behind this narrow intent-based RPC instead.
--
-- Supported intents:
--   withdraw      applied/reviewing/saved_by_host -> withdrawn
--   accept_offer  offered -> accepted
--   decline_offer offered -> withdrawn
--
-- The existing lifecycle trigger remains authoritative. This function adds
-- caller ownership, intent-specific source-state checks, row locking, capacity
-- serialization, truthful decided_at stamps for offer responses, and an
-- explicit JSON result (including failures) so zero-row writes can never be
-- reported as success.

begin;

create or replace function public.seeker_transition_application(
  p_application_id uuid,
  p_intent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status text;
  v_listing_id uuid;
  v_target_status text;
  v_withdrawn_reason text;
  v_decided_at timestamptz;
  v_expires_at timestamptz;
  v_remaining_roles integer;
  v_updated_count integer;
  v_constraint_message text;
begin
  if p_intent is null
     or p_intent not in ('withdraw', 'accept_offer', 'decline_offer') then
    return jsonb_build_object('ok', false, 'error', 'invalid_intent');
  end if;

  -- Normal authenticated callers must resolve through their JWT `sub`. The
  -- service role is the only explicit bypass: it already bypasses RLS, is
  -- separately EXECUTE-granted below, and is used by the local review bench.
  if auth.role() <> 'service_role'
     and not exists (select 1 from public.current_seeker_profile_ids()) then
    return jsonb_build_object('ok', false, 'error', 'profile_not_found');
  end if;

  -- Lock the owned application before validating its source state. A missing
  -- and a non-owned id deliberately share `not_found` to avoid an IDOR oracle.
  select a.status, a.listing_id, a.expires_at
    into v_current_status, v_listing_id, v_expires_at
    from public.applications a
   where a.id = p_application_id
     and (
       auth.role() = 'service_role'
       or a.seeker_profile_id in (
         select public.current_seeker_profile_ids()
       )
     )
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_intent in ('accept_offer', 'decline_offer')
     and v_expires_at is not null
     and v_expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'offer_expired');
  end if;

  if p_intent = 'withdraw' then
    if v_current_status not in ('applied', 'reviewing', 'saved_by_host') then
      return jsonb_build_object('ok', false, 'error', 'invalid_transition');
    end if;
    v_target_status := 'withdrawn';
    v_withdrawn_reason := 'seeker_withdrew';
  elsif p_intent = 'accept_offer' then
    if v_current_status <> 'offered' then
      return jsonb_build_object('ok', false, 'error', 'invalid_transition');
    end if;
    v_target_status := 'accepted';
    v_decided_at := now();

    -- Serialize acceptances on the listing row. The existing role-count trigger
    -- still performs the decrement and its CHECK remains the final invariant.
    select l.remaining_role_count
      into v_remaining_roles
      from public.listings l
     where l.id = v_listing_id
     for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_remaining_roles <= 0 then
      return jsonb_build_object('ok', false, 'error', 'listing_full');
    end if;
  else
    if v_current_status <> 'offered' then
      return jsonb_build_object('ok', false, 'error', 'invalid_transition');
    end if;
    v_target_status := 'withdrawn';
    v_withdrawn_reason := 'offer_declined';
    v_decided_at := now();
  end if;

  begin
    update public.applications
       set status = v_target_status,
           withdrawn_reason = v_withdrawn_reason,
           decided_at = case
             when p_intent in ('accept_offer', 'decline_offer')
               then v_decided_at
             else decided_at
           end
     where id = p_application_id;

    get diagnostics v_updated_count = row_count;
    if v_updated_count <> 1 then
      return jsonb_build_object('ok', false, 'error', 'transition_failed');
    end if;
  exception
    when check_violation then
      get stacked diagnostics v_constraint_message = message_text;
      if v_constraint_message like 'Illegal application lifecycle transition:%' then
        return jsonb_build_object('ok', false, 'error', 'invalid_transition');
      end if;
      if p_intent = 'accept_offer' then
        return jsonb_build_object('ok', false, 'error', 'listing_full');
      end if;
      return jsonb_build_object('ok', false, 'error', 'constraint_violation');
  end;

  return jsonb_build_object(
    'ok', true,
    'status', v_target_status,
    'decided_at', v_decided_at
  );
end;
$$;

comment on function public.seeker_transition_application(uuid, text) is
  'Atomically performs one seeker-owned application intent: withdraw, '
  'accept_offer, or decline_offer. Enforces ownership/current state and returns '
  'an explicit JSON result; offer responses stamp applications.decided_at.';

revoke execute on function public.seeker_transition_application(uuid, text)
  from public;
grant execute on function public.seeker_transition_application(uuid, text)
  to authenticated, service_role;

commit;
