-- 001_extensions_and_functions.sql
-- Explore&Earn — Migrations V1 · Foundation
-- Extensions, shared trigger helpers, and the canonical lifecycle-transition
-- engine (guardrail G16).
--
-- Canon: SQL-Level Schema Architecture, Lifecycle Registry, and the merged
-- contracts spine (packages/contracts/src/lifecycles.ts). The
-- lifecycle_transition rows below MIRROR the LIFECYCLE_*_TRANSITIONS maps
-- exactly; do not edit here without updating the Lifecycle Registry + contracts
-- first (G13/G16).
--
-- DR-B1: status fields are text + CHECK (no native pg enums).
-- DR-B2: uuid primary keys via gen_random_uuid().
-- NOTE: review-only — this migration is authored for review and is NOT applied
-- to any live database by this PR (running migrations is a founder-operated
-- gate).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at = now() on any row update.';

-- ---------------------------------------------------------------------------
-- Lifecycle transition engine (G16)
-- ---------------------------------------------------------------------------
create table lifecycle_transition (
  machine     text not null,
  from_state  text not null,
  to_state    text not null,
  primary key (machine, from_state, to_state)
);

comment on table lifecycle_transition is
  'Canonical allowed state transitions, mirrored from the Lifecycle Registry / '
  'contracts lifecycles.ts. Read by enforce_lifecycle_transition().';

create or replace function enforce_lifecycle_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_machine text := tg_argv[0];
  v_col     text := coalesce(tg_argv[1], 'status');
  v_new     jsonb := to_jsonb(new);
  v_from    text := to_jsonb(old) ->> v_col;
  v_to      text := v_new ->> v_col;
begin
  -- Misconfiguration guards: a missing machine arg or a wrong/typo'd status
  -- column name would otherwise let an illegal transition slip through as a
  -- silent no-op (v_to would resolve to NULL). errcodes are explicit 5-char
  -- SQLSTATEs (42703 = undefined_column, 23514 = check_violation).
  if v_machine is null then
    raise exception
      'enforce_lifecycle_transition: machine argument (tg_argv[0]) is required';
  end if;
  if not (v_new ? v_col) then
    raise exception
      'enforce_lifecycle_transition: status column "%" not found on % row',
      v_col, tg_table_name
      using errcode = '42703';
  end if;

  -- No-op when the status column is unchanged or was null (initial set).
  if v_from is null or v_from is not distinct from v_to then
    return new;
  end if;

  -- search_path is pinned above, but qualify the table explicitly so the G16
  -- check can never resolve to a temp/shadow lifecycle_transition.
  if not exists (
    select 1 from public.lifecycle_transition t
    where t.machine = v_machine
      and t.from_state = v_from
      and t.to_state = v_to
  ) then
    raise exception
      'Illegal % lifecycle transition: % -> %', v_machine, v_from, v_to
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function enforce_lifecycle_transition() is
  'BEFORE UPDATE trigger (args: machine[, status_column]). Rejects status '
  'changes absent from lifecycle_transition. Attach per lifecycle table.';

-- ---------------------------------------------------------------------------
-- Seed canonical transitions (mirror of contracts lifecycles.ts)
-- ---------------------------------------------------------------------------
insert into lifecycle_transition (machine, from_state, to_state) values
  -- application (APPLICATION_TRANSITIONS)
  ('application','applied','reviewing'),
  ('application','applied','saved_by_host'),
  ('application','applied','offered'),
  ('application','applied','not_selected'),
  ('application','applied','withdrawn'),
  ('application','applied','expired'),
  ('application','reviewing','saved_by_host'),
  ('application','reviewing','offered'),
  ('application','reviewing','not_selected'),
  ('application','reviewing','withdrawn'),
  ('application','reviewing','expired'),
  ('application','saved_by_host','offered'),
  ('application','saved_by_host','not_selected'),
  ('application','saved_by_host','withdrawn'),
  ('application','saved_by_host','expired'),
  ('application','offered','accepted'),
  ('application','offered','withdrawn'),
  ('application','offered','expired'),
  ('application','accepted','active'),
  ('application','active','completed'),
  -- invite (INVITE_TRANSITIONS)
  ('invite','created','delivered'),
  ('invite','created','withdrawn'),
  ('invite','created','expired'),
  ('invite','created','ignored'),
  ('invite','delivered','viewed'),
  ('invite','delivered','applied'),
  ('invite','delivered','withdrawn'),
  ('invite','delivered','expired'),
  ('invite','delivered','ignored'),
  ('invite','viewed','applied'),
  ('invite','viewed','withdrawn'),
  ('invite','viewed','expired'),
  ('invite','viewed','ignored'),
  -- offer (OFFER_TRANSITIONS)
  ('offer','created','delivered'),
  ('offer','created','declined'),
  ('offer','created','expired'),
  ('offer','created','withdrawn'),
  ('offer','delivered','viewed'),
  ('offer','delivered','accepted'),
  ('offer','delivered','declined'),
  ('offer','delivered','expired'),
  ('offer','delivered','withdrawn'),
  ('offer','viewed','accepted'),
  ('offer','viewed','declined'),
  ('offer','viewed','expired'),
  ('offer','viewed','withdrawn'),
  -- host_attestation (HOST_ATTESTATION_TRANSITIONS)
  ('host_attestation','not_attested','attested'),
  ('host_attestation','attested','attested_stale'),
  ('host_attestation','attested','withdrawn'),
  ('host_attestation','attested_stale','attested'),
  ('host_attestation','attested_stale','not_attested'),
  ('host_attestation','withdrawn','attested'),
  -- host_account (HOST_ACCOUNT_TRANSITIONS)
  ('host_account','active','paused'),
  ('host_account','active','removed'),
  ('host_account','paused','active'),
  ('host_account','removed','appealing'),
  ('host_account','removed','active'),
  ('host_account','appealing','active'),
  ('host_account','appealing','removed'),
  -- host_removal_appeal (HOST_REMOVAL_APPEAL_TRANSITIONS)
  ('host_removal_appeal','submitted','under_review'),
  ('host_removal_appeal','submitted','withdrawn'),
  ('host_removal_appeal','under_review','granted'),
  ('host_removal_appeal','under_review','denied'),
  ('host_removal_appeal','under_review','withdrawn'),
  -- identity_verification (IDENTITY_VERIFICATION_TRANSITIONS)
  ('identity_verification','draft','submitted'),
  ('identity_verification','submitted','under_review'),
  ('identity_verification','under_review','approved'),
  ('identity_verification','under_review','awaiting_more_info'),
  ('identity_verification','under_review','rejected'),
  ('identity_verification','awaiting_more_info','submitted'),
  ('identity_verification','approved','revoked'),
  ('identity_verification','approved','expired'),
  ('identity_verification','approved','superseded'),
  ('identity_verification','rejected','superseded'),
  ('identity_verification','expired','superseded'),
  -- refund_review (REFUND_REVIEW_TRANSITIONS)
  ('refund_review','opened','under_review'),
  ('refund_review','under_review','approved'),
  ('refund_review','under_review','denied'),
  ('refund_review','under_review','cancelled'),
  ('refund_review','approved','processed'),
  ('refund_review','approved','failed'),
  ('refund_review','approved','service_credit_issued'),
  ('refund_review','failed','under_review'),
  -- dispute (DISPUTE_TRANSITIONS)
  ('dispute','open','under_review'),
  ('dispute','under_review','awaiting_user'),
  ('dispute','under_review','escalated'),
  ('dispute','under_review','resolved'),
  ('dispute','under_review','denied'),
  ('dispute','awaiting_user','under_review'),
  ('dispute','escalated','under_review'),
  ('dispute','escalated','resolved'),
  ('dispute','escalated','denied'),
  ('dispute','escalated','closed'),
  ('dispute','resolved','closed'),
  ('dispute','denied','closed'),
  -- conversation (CONVERSATION_TRANSITIONS)
  ('conversation','active','restricted'),
  ('conversation','active','closed'),
  ('conversation','active','expired'),
  ('conversation','restricted','active'),
  ('conversation','restricted','closed'),
  ('conversation','closed','archived'),
  ('conversation','expired','archived'),
  -- scheduling (SCHEDULING_TRANSITIONS)
  ('scheduling','proposed','selected'),
  ('scheduling','proposed','alternate_requested'),
  ('scheduling','proposed','cancelled'),
  ('scheduling','proposed','expired'),
  ('scheduling','selected','completed'),
  ('scheduling','selected','cancelled'),
  ('scheduling','selected','expired'),
  ('scheduling','selected','no_show'),
  ('scheduling','alternate_requested','proposed'),
  ('scheduling','alternate_requested','selected'),
  -- media_processing (MEDIA_PROCESSING_TRANSITIONS)
  ('media_processing','uploaded','processing'),
  ('media_processing','processing','ready'),
  ('media_processing','processing','failed'),
  -- media_moderation (MEDIA_MODERATION_TRANSITIONS)
  ('media_moderation','pending','under_review'),
  ('media_moderation','pending','approved'),
  ('media_moderation','pending','rejected'),
  ('media_moderation','pending','hidden'),
  ('media_moderation','pending','removed'),
  ('media_moderation','under_review','approved'),
  ('media_moderation','under_review','rejected'),
  ('media_moderation','under_review','hidden'),
  ('media_moderation','under_review','removed'),
  ('media_moderation','approved','hidden'),
  ('media_moderation','approved','removed'),
  -- campaign (CAMPAIGN_TRANSITIONS; boost + featured share this machine)
  ('campaign','scheduled','active'),
  ('campaign','scheduled','paused'),
  ('campaign','scheduled','cancelled'),
  ('campaign','active','completed'),
  ('campaign','active','paused'),
  ('campaign','active','cancelled'),
  ('campaign','active','removed'),
  ('campaign','paused','active'),
  ('campaign','paused','cancelled'),
  ('campaign','completed','refunded'),
  -- report (REPORT_TRANSITIONS)
  ('report','submitted','triaged'),
  ('report','triaged','under_review'),
  ('report','under_review','action_taken'),
  ('report','under_review','dismissed'),
  ('report','under_review','escalated'),
  ('report','escalated','action_taken'),
  ('report','escalated','closed'),
  ('report','action_taken','closed'),
  ('report','dismissed','closed'),
  -- moderation_case (MODERATION_CASE_TRANSITIONS)
  ('moderation_case','open','triaged'),
  ('moderation_case','triaged','under_review'),
  ('moderation_case','under_review','awaiting_user'),
  ('moderation_case','under_review','escalated'),
  ('moderation_case','under_review','action_taken'),
  ('moderation_case','awaiting_user','under_review'),
  ('moderation_case','escalated','under_review'),
  ('moderation_case','escalated','action_taken'),
  ('moderation_case','escalated','resolved'),
  ('moderation_case','action_taken','resolved'),
  ('moderation_case','resolved','closed'),
  -- review (REVIEW_TRANSITIONS)
  ('review','draft','submitted'),
  ('review','submitted','under_review'),
  ('review','submitted','hidden'),
  ('review','submitted','removed'),
  ('review','under_review','approved'),
  ('review','under_review','hidden'),
  ('review','under_review','removed'),
  ('review','approved','hidden'),
  ('review','approved','removed'),
  -- check_in (CHECK_IN_TRANSITIONS)
  ('check_in','scheduled','sent'),
  ('check_in','sent','completed'),
  ('check_in','sent','skipped'),
  ('check_in','sent','expired'),
  ('check_in','sent','escalated'),
  ('check_in','completed','escalated');
