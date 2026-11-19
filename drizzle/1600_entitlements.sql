-- 1600_entitlements (SP2 W1): the append-only entitlements ledger. Grants add listing slots,
-- seats or invite credits to an organization for a time window; consumptions spend credits
-- from grants. Capacity limits are the sum of valid grants (src/modules/entitlements).

-- Grants ---------------------------------------------------------------------------------------

-- A grant is valid at t when valid_from <= t < coalesce(valid_until, 'infinity'). Rows are
-- never deleted; the only changes allowed are shortening valid_until (endGrant) and clearing
-- created_by (privacy erase). See app.entitlement_grants_guard() below.
create table app.entitlement_grants (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  -- SP6 extends this CHECK (and EntitlementKind).
  kind text not null check (kind in ('listing_slot', 'seat', 'invite_credit')),
  quantity int not null check (quantity > 0),
  source text not null check (source in ('plan', 'operator', 'pack', 'addon')),
  source_ref text not null,
  valid_from timestamptz not null default now(),
  -- Null means open-ended.
  valid_until timestamptz,
  idempotency_key text not null unique check (idempotency_key <> ''),
  reason text,
  created_by uuid references app.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlement_grants_window check (valid_until is null or valid_until >= valid_from)
);
alter table app.entitlement_grants enable row level security;
create index entitlement_grants_org_kind_idx on app.entitlement_grants (org_id, kind, valid_from);
create trigger entitlement_grants_set_updated_at before update on app.entitlement_grants
  for each row execute function app.set_updated_at();

-- Consumptions ---------------------------------------------------------------------------------

-- One consume() call writes one row per grant it draws from, keyed <key>, <key>#2, ...
-- A row can be reversed once (reversed_at and reversal_reason set together) and never deleted.
create table app.entitlement_consumptions (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  grant_id uuid not null references app.entitlement_grants (id),
  kind text not null check (kind in ('listing_slot', 'seat', 'invite_credit')),
  quantity int not null check (quantity > 0),
  subject_type text not null check (subject_type <> ''),
  subject_id text not null,
  idempotency_key text not null unique check (idempotency_key <> ''),
  reversed_at timestamptz,
  reversal_reason text,
  created_by uuid references app.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlement_consumptions_reversal
    check ((reversed_at is null) = (reversal_reason is null))
);
alter table app.entitlement_consumptions enable row level security;
create index entitlement_consumptions_open_idx on app.entitlement_consumptions (grant_id)
  where reversed_at is null;
create trigger entitlement_consumptions_set_updated_at
  before update on app.entitlement_consumptions
  for each row execute function app.set_updated_at();

-- Append-only guards -----------------------------------------------------------------------------

-- Rejects DELETE and every UPDATE except shortening valid_until (from open-ended, or to an
-- earlier time) and clearing created_by.
create or replace function app.entitlement_grants_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'app.entitlement_grants is append-only: DELETE is not allowed'
      using errcode = 'restrict_violation';
  end if;
  if (to_jsonb(new) - 'valid_until' - 'created_by' - 'updated_at')
       is distinct from (to_jsonb(old) - 'valid_until' - 'created_by' - 'updated_at')
     or (new.created_by is distinct from old.created_by and new.created_by is not null)
     or (new.valid_until is distinct from old.valid_until
         and (new.valid_until is null
              or (old.valid_until is not null and new.valid_until > old.valid_until)))
  then
    raise exception 'app.entitlement_grants is append-only: only shortening valid_until is allowed'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger entitlement_grants_guard
  before update or delete on app.entitlement_grants
  for each row execute function app.entitlement_grants_guard();

-- Rejects DELETE and every UPDATE except setting reversed_at and reversal_reason once, and
-- clearing created_by.
create or replace function app.entitlement_consumptions_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'app.entitlement_consumptions is append-only: DELETE is not allowed'
      using errcode = 'restrict_violation';
  end if;
  if (to_jsonb(new) - 'reversed_at' - 'reversal_reason' - 'created_by' - 'updated_at')
       is distinct from (to_jsonb(old) - 'reversed_at' - 'reversal_reason' - 'created_by' - 'updated_at')
     or (new.created_by is distinct from old.created_by and new.created_by is not null)
     or ((new.reversed_at is distinct from old.reversed_at
          or new.reversal_reason is distinct from old.reversal_reason)
         and (old.reversed_at is not null or new.reversed_at is null))
  then
    raise exception 'app.entitlement_consumptions is append-only: only one reversal is allowed'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger entitlement_consumptions_guard
  before update or delete on app.entitlement_consumptions
  for each row execute function app.entitlement_consumptions_guard();

-- No TRUNCATE guard: tests reset app.organizations with `truncate ... cascade`, which reaches
-- these tables through their foreign keys.
