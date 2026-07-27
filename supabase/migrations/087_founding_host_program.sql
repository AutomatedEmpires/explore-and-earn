-- 087_founding_host_program.sql
--
-- Commercial redesign phase 4, decision D10: the founding-host program becomes a
-- REAL config-backed program or it stays invisible.
--
-- WHAT IT WAS. packages/contracts carried FOUNDING_LOCKED_PRICING and a seat
-- cap, six live Stripe prices sat dormant, and the estate audit of 2026-07-17
-- recorded the whole thing as the single finding that becomes UNFIXABLE once it
-- works: a lifetime price lock offered to a fixed number of early hosts, with no
-- claim path, no capacity tracking and no surface. Guardrail G53 answered by
-- FORBIDDING the words anywhere in the application. This migration is the other
-- half of lifting that ban -- the counting the promise always implied.
--
-- THE PRODUCT LAW THIS ENCODES, and every column exists to serve it:
--
--   * NOTHING QUANTITATIVE IS RENDERED UNTIL THE FOUNDER CONFIGURES IT. There is
--     no seeded row. A surface with no row, or a row in 'draft', may say at most
--     that a program for early hosts is coming; it may not show a count, a
--     remaining figure or a countdown. A fabricated deadline that resets on
--     reload is the exact dishonesty the redesign exists to remove, so the
--     deadline is a stored timestamp the founder sets and the client only ever
--     counts DOWN to it.
--   * THE NUMBERS A VISITOR SEES ARE THE NUMBERS THE DATABASE ENFORCES. capacity
--     and claimed are readable by anon precisely so the public surface can quote
--     them instead of inventing them, and the CHECK below makes "claimed of
--     capacity" true by construction rather than by convention.
--   * A SEAT IS CONSUMED ONCE, BY ONE IDENTITY, AND ONLY WHILE THE PROGRAM IS
--     OPEN. Stripe delivers webhooks at least once and does not order them, so
--     the claim path is idempotent per Clerk id and serialized by an advisory
--     lock -- the shape 062 and 085 already use for invite credits and listing
--     slots.
--
-- WHY THE CLAIM IS NOT ON THE CHECKOUT PATH. A seat may only be spent against
-- money that actually arrived, and `checkout.session.completed` does not mean
-- paid (delayed-notification methods settle later, or fail). So the claim runs
-- on the same grant path everything else runs on, after checkoutIsPaid, and a
-- checkout that is abandoned or fails costs the program nothing.
--
-- WHY A DISCREPANCY TABLE EXISTS. Between opening a checkout and the money
-- landing, the last seat can go to somebody else. The host paid a price that is
-- a VALID plan price, so refusing the entitlement would take their money and
-- give them nothing; over-claiming capacity would break the count the public
-- page is quoting. Both are wrong, so the webhook grants the paid tier and
-- records the over-subscription where the founder can see it. Silence is the
-- only option that is not available.
--
-- Additive and idempotent throughout, so `supabase db reset` rebuilds from 001.
-- Never applied by an agent; the db-migrate pipeline applies it on merge.

begin;

-- ---------------------------------------------------------------------------
-- 1) The program. One row, or none.
-- ---------------------------------------------------------------------------
--
-- A singleton by CHECK rather than by convention: `id = 1` means every reader
-- can say `where id = 1` and every writer is an upsert on a known key, so there
-- is no ordering question and no "which row is the live one" ambiguity. No row
-- is inserted here -- absence IS the dark state, and it is the state this
-- migration deliberately ships in.
create table if not exists public.founding_host_program (
  id                  smallint    primary key default 1 check (id = 1),
  -- How many seats the program offers, in total, across all tiers.
  capacity            integer     not null default 0 check (capacity >= 0),
  -- How many have been consumed. Maintained ONLY by claim_founding_host_seat.
  claimed             integer     not null default 0 check (claimed >= 0),
  -- When enrolment closes. Nullable so a draft row can exist before the founder
  -- has decided; a null deadline can never be claimed against.
  enrollment_deadline timestamptz,
  status              text        not null default 'draft'
                        check (status in ('draft', 'open', 'full', 'ended')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- The invariant the public surface quotes. Without it "3 of 100 remain" is a
-- claim the database does not hold, and an admin typo could publish a negative
-- remainder to every visitor.
alter table public.founding_host_program
  drop constraint if exists founding_host_program_claimed_within_capacity;
alter table public.founding_host_program
  add constraint founding_host_program_claimed_within_capacity
  check (claimed <= capacity);

comment on table public.founding_host_program is
  'Singleton configuration for the founding-host program (commercial redesign D10). Written only under the service role, by the admin console. anon and authenticated hold SELECT on capacity, claimed, enrollment_deadline and status so public surfaces render real figures; absence of the row, or status draft, is the dark state in which no surface may render a count, a remainder or a countdown.';

drop trigger if exists trg_founding_host_program_updated_at on public.founding_host_program;
create trigger trg_founding_host_program_updated_at
  before update on public.founding_host_program
  for each row execute function public.set_updated_at();

-- Supabase's default privileges hand a new public-schema table to anon and
-- authenticated in full. The TABLE grant is revoked FIRST: a column-level revoke
-- is a silent no-op while a table-level grant survives (the 083 ordering rule).
revoke all on table public.founding_host_program from anon, authenticated;

-- Exactly the four columns a public surface needs, and no others. id, created_at
-- and updated_at are operational facts about the row rather than facts about the
-- offer, and nothing renders them.
grant select (capacity, claimed, enrollment_deadline, status)
  on public.founding_host_program to anon, authenticated;

alter table public.founding_host_program enable row level security;

-- One row, public by design: the whole point of the grant above is that a
-- signed-out visitor on the pricing page can read the real figures. Row
-- visibility is therefore unconditional and the COLUMN grant is what limits
-- what "visible" means. No INSERT / UPDATE / DELETE policy exists and the
-- grants above withhold the privilege, so the service role is the sole writer.
drop policy if exists founding_host_program_select_public on public.founding_host_program;
create policy founding_host_program_select_public on public.founding_host_program
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 2) The claims. One per Clerk identity, forever.
-- ---------------------------------------------------------------------------
--
-- The unique index is the idempotency, structurally rather than procedurally:
-- Stripe delivers at least once, and a redelivered grant must not consume a
-- second seat. It is also what makes the count auditable -- `claimed` is a
-- cached integer, and these rows are the evidence for it.
create table if not exists public.founding_host_claims (
  id            uuid        primary key default gen_random_uuid(),
  clerk_user_id text        not null,
  claimed_at    timestamptz not null default now()
);

create unique index if not exists uq_founding_host_claims_clerk_user
  on public.founding_host_claims (clerk_user_id);

comment on table public.founding_host_claims is
  'One row per Clerk identity that has consumed a founding seat. Written only by public.claim_founding_host_seat under the service role; invisible and unwritable to anon and authenticated. The unique index on clerk_user_id is what makes a redelivered Stripe webhook unable to consume a second seat.';

alter table public.founding_host_claims enable row level security;
revoke all on table public.founding_host_claims from anon, authenticated;
-- No policy of any kind. A client role holds neither the grant nor a policy, so
-- the table is unreachable in both dimensions rather than in one.

-- ---------------------------------------------------------------------------
-- 3) The discrepancies. What the race leaves behind.
-- ---------------------------------------------------------------------------
create table if not exists public.founding_host_claim_discrepancies (
  id                         uuid        primary key default gen_random_uuid(),
  clerk_user_id              text        not null,
  -- The reason the claim function gave. Free-form on purpose: a new refusal
  -- reason must not be silently dropped because a CHECK did not know about it.
  reason                     text        not null,
  stripe_checkout_session_id text,
  noted_at                   timestamptz not null default now(),
  resolved_at                timestamptz
);

-- Same at-least-once discipline as every other Stripe-facing write in this
-- codebase: one note per Checkout Session, so a redelivery does not fill the
-- founder's queue with copies of one event.
create unique index if not exists uq_founding_host_claim_discrepancy_session
  on public.founding_host_claim_discrepancies (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists idx_founding_host_claim_discrepancies_open
  on public.founding_host_claim_discrepancies (noted_at)
  where resolved_at is null;

comment on table public.founding_host_claim_discrepancies is
  'Paid founding checkouts whose seat claim was refused because the program filled or ended between checkout and settlement. The paid tier is still granted -- the money arrived against a valid plan price -- and this is the record that stops the over-subscription being silent. Service-role only.';

alter table public.founding_host_claim_discrepancies enable row level security;
revoke all on table public.founding_host_claim_discrepancies from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) The only way a seat is consumed.
-- ---------------------------------------------------------------------------
--
-- Returns jsonb rather than raising, because every caller is a webhook whose
-- other job is to grant a paid entitlement: a raise here would answer Stripe
-- non-2xx and force a redelivery of a grant that already succeeded. A refusal is
-- a RESULT, and the caller decides what to do with it.
--
--   { ok: true,  already_claimed: false, claimed, capacity, status }
--   { ok: true,  already_claimed: true,  claimed, capacity, status }
--   { ok: false, reason: 'missing_identity' | 'not_configured' | 'not_open'
--                         | 'ended' | 'full' }
--
-- SECURITY DEFINER with an empty search_path and fully-qualified public names,
-- matching the 083/085 helpers it sits beside. The advisory lock is taken on a
-- constant key because the program is a singleton -- two concurrent webhooks
-- must not both read the last free seat.
create or replace function public.claim_founding_host_seat(
  p_clerk_user_id text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_clerk    text;
  v_row      public.founding_host_program%rowtype;
  v_inserted integer := 0;
begin
  v_clerk := nullif(btrim(coalesce(p_clerk_user_id, '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_identity');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('founding_host_seat', 0));

  select * into v_row
    from public.founding_host_program
   where id = 1
   for update;

  -- No row is the DARK state, not an error. The founder has not configured a
  -- program, so there is no seat to consume and nothing to complain about.
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_configured');
  end if;

  -- Idempotency comes FIRST, ahead of every gate below. A redelivered webhook
  -- for a host who already holds a seat must answer "you already have it" even
  -- after the program has filled or ended -- otherwise a retry of a successful
  -- grant would be recorded as an over-subscription.
  if exists (
    select 1
      from public.founding_host_claims c
     where c.clerk_user_id = v_clerk
  ) then
    return jsonb_build_object(
      'ok', true, 'already_claimed', true,
      'claimed', v_row.claimed, 'capacity', v_row.capacity, 'status', v_row.status
    );
  end if;

  if v_row.status <> 'open' then
    return jsonb_build_object(
      'ok', false,
      'reason', case v_row.status
                  when 'full'  then 'full'
                  when 'ended' then 'ended'
                  else 'not_open'
                end
    );
  end if;

  -- A null deadline can never be claimed against. An unset deadline is not "no
  -- deadline" -- it is a decision the founder has not made, and the safe reading
  -- of an undecided term is that it does not entitle anybody to anything.
  if v_row.enrollment_deadline is null or now() >= v_row.enrollment_deadline then
    return jsonb_build_object('ok', false, 'reason', 'ended');
  end if;

  if v_row.claimed >= v_row.capacity then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  insert into public.founding_host_claims (clerk_user_id)
  values (v_clerk)
  on conflict (clerk_user_id) do nothing;
  get diagnostics v_inserted = row_count;

  -- Belt and braces against a concurrent claim for the same identity that the
  -- advisory lock did not cover (a manual service-role insert, say). The unique
  -- index decided; this caller must not also increment.
  if v_inserted = 0 then
    return jsonb_build_object(
      'ok', true, 'already_claimed', true,
      'claimed', v_row.claimed, 'capacity', v_row.capacity, 'status', v_row.status
    );
  end if;

  -- The status flip belongs to the write that fills the last seat, so the public
  -- surface stops offering a seat the moment there is none -- without waiting for
  -- an admin to notice. 'ended' is the founder's word for a closed program;
  -- 'full' is the program's own.
  update public.founding_host_program
     set claimed = claimed + 1,
         status  = case when claimed + 1 >= capacity then 'full' else status end
   where id = 1
  returning * into v_row;

  return jsonb_build_object(
    'ok', true, 'already_claimed', false,
    'claimed', v_row.claimed, 'capacity', v_row.capacity, 'status', v_row.status
  );
end;
$$;

comment on function public.claim_founding_host_seat(text) is
  'Consumes one founding seat for a Clerk identity, transactionally, and only while the program is open, in date and below capacity. Idempotent per identity so a redelivered Stripe webhook cannot take two seats. Flips status to full on the last seat. Returns ok/reason rather than raising, because its caller is a webhook that must still answer 2xx for the entitlement it already granted.';

-- ---------------------------------------------------------------------------
-- 5) The record of an over-subscription.
-- ---------------------------------------------------------------------------
create or replace function public.record_founding_claim_discrepancy(
  p_clerk_user_id text,
  p_reason        text,
  p_session_id    text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_clerk    text;
  v_reason   text;
  v_session  text;
  v_inserted integer := 0;
begin
  v_clerk   := nullif(btrim(coalesce(p_clerk_user_id, '')), '');
  v_reason  := nullif(btrim(coalesce(p_reason, '')), '');
  v_session := nullif(btrim(coalesce(p_session_id, '')), '');

  if v_clerk is null or v_reason is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  insert into public.founding_host_claim_discrepancies
    (clerk_user_id, reason, stripe_checkout_session_id)
  values (v_clerk, v_reason, v_session)
  on conflict (stripe_checkout_session_id)
    where stripe_checkout_session_id is not null
    do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('ok', true, 'recorded', v_inserted = 1);
end;
$$;

comment on function public.record_founding_claim_discrepancy(text, text, text) is
  'Records a paid founding checkout whose seat claim was refused, so an over-subscription is visible to the founder instead of silent. Idempotent per Stripe Checkout Session.';

-- ---------------------------------------------------------------------------
-- 6) Function grants.
-- ---------------------------------------------------------------------------
-- Revoking from PUBLIC drops the default EXECUTE grant for EVERY role,
-- service_role included, so the one role that needs each function is re-granted
-- explicitly. Neither function is reachable through PostgREST: a client that
-- could claim a seat could exhaust the program without paying for anything.
revoke execute on function public.claim_founding_host_seat(text)
  from public, anon, authenticated;
revoke execute on function public.record_founding_claim_discrepancy(text, text, text)
  from public, anon, authenticated;

grant execute on function public.claim_founding_host_seat(text)
  to service_role;
grant execute on function public.record_founding_claim_discrepancy(text, text, text)
  to service_role;

commit;
