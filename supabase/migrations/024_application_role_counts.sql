-- 024_application_role_counts.sql
-- Maintain listings.accepted_count and remaining_role_count whenever an
-- application status transitions to or from 'accepted'.
--
-- Canon honored:
--   G16: status transitions are already guarded by trg_applications_lifecycle
--     (enforce_lifecycle_transition, seeded in 001). This trigger fires AFTER
--     that guard approves the write so we never double-count on a rolled-back
--     lifecycle rejection.
--   listings_role_counts_chk (006): accepted_count <= role_count and
--     remaining_role_count = role_count - accepted_count. The trigger upholds
--     this invariant; if accepted_count would push remaining_role_count below 0
--     (listing already full), the column-level CHECK (remaining_role_count >= 0)
--     causes the transaction to roll back — the caller receives SQLSTATE 23514.
-- Additive only: no existing columns or triggers are altered.

-- ---------------------------------------------------------------------------
-- Trigger function
-- ---------------------------------------------------------------------------
create or replace function maintain_listing_role_counts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Transition INTO 'accepted': one slot is claimed.
  if new.status = 'accepted' then
    update public.listings
    set accepted_count       = accepted_count + 1,
        remaining_role_count = remaining_role_count - 1
    where id = new.listing_id;

  -- Transition OUT of 'accepted': one slot is released.
  elsif old.status = 'accepted' then
    update public.listings
    set accepted_count       = accepted_count - 1,
        remaining_role_count = remaining_role_count + 1
    where id = new.listing_id;
  end if;

  return new;
end;
$$;

comment on function maintain_listing_role_counts() is
  'AFTER UPDATE trigger: keeps listings.accepted_count and remaining_role_count '
  'consistent when an application status transitions to or from ''accepted''. '
  'Enforces the listings_role_counts_chk CHECK constraint from 006_listings.sql. '
  'Fires only when application.status actually changes (WHEN clause on trigger).';

-- ---------------------------------------------------------------------------
-- Attach trigger to applications
-- ---------------------------------------------------------------------------
create trigger trg_applications_role_counts
  after update on applications
  for each row
  when (old.status is distinct from new.status)
  execute function maintain_listing_role_counts();

comment on trigger trg_applications_role_counts on applications is
  'Fires after any status change on an application row to keep the parent '
  'listing''s accepted_count and remaining_role_count in sync.';
