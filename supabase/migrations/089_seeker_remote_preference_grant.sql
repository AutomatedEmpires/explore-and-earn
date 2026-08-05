-- Migration 089: restore the one seeker-owned work-setting write omitted from
-- migration 061's explicit column allow-list.
--
-- `remote_preference` already exists with its canonical CHECK constraint from
-- migration 051, and seeker_profiles_update_own still restricts which row an
-- authenticated caller may update. This grant only restores access to that one
-- column; it does not reopen table-wide UPDATE or expose any server-owned data.
--
-- Additive and idempotent. Apply only through the reviewed db-migrate pipeline.

begin;

grant update (remote_preference)
  on public.seeker_profiles
  to authenticated;

commit;
