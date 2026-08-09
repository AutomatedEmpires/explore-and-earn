-- Database-authoritative identity for seeker resume experiences.
--
-- Application validation gives seekers immediate, specific feedback, but the
-- owner-scoped resume table is also writable through the authenticated Supabase
-- Data API. A CHECK constraint is therefore the only boundary every writer
-- crosses. It remains NOT VALID so historical blank rows stay available for
-- repair or deletion while every new or updated row must identify a role title
-- or an employer/place.
--
-- Every text-presence check below uses the exact current ECMAScript
-- String.prototype.trim character set, expressed as Unicode code points rather
-- than a locale-dependent PostgreSQL character class: TAB, LF, VT, FF, CR,
-- SPACE, NBSP, U+1680, U+2000..U+200A, U+2028, U+2029, U+202F, U+205F,
-- U+3000, and BOM/U+FEFF.
--
-- Migration 091's application gate is redefined in the same change so legacy
-- blank rows cannot satisfy either the experience-backed skill requirement or
-- the bio-or-experience requirement.
--
-- REVIEW-ONLY. Apply only through the protected db-migrate workflow after the
-- compatible application release is live.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

create schema if not exists private;
revoke all on schema private from public;

do $do$
declare
  v_identity_expression constant text := $expression$
    (
      (
        nullif(
          btrim(
            coalesce(role_title, ''),
            concat(
              chr(9), chr(10), chr(11), chr(12), chr(13), chr(32),
              chr(160), chr(5760),
              chr(8192), chr(8193), chr(8194), chr(8195), chr(8196),
              chr(8197), chr(8198), chr(8199), chr(8200), chr(8201),
              chr(8202), chr(8232), chr(8233), chr(8239), chr(8287),
              chr(12288), chr(65279)
            )
          ),
          ''
        ) is not null
      )
      or (
        nullif(
          btrim(
            coalesce(company_name, ''),
            concat(
              chr(9), chr(10), chr(11), chr(12), chr(13), chr(32),
              chr(160), chr(5760),
              chr(8192), chr(8193), chr(8194), chr(8195), chr(8196),
              chr(8197), chr(8198), chr(8199), chr(8200), chr(8201),
              chr(8202), chr(8232), chr(8233), chr(8239), chr(8287),
              chr(12288), chr(65279)
            )
          ),
          ''
        ) is not null
      )
    )
  $expression$;
  v_existing_oid oid;
  v_existing_type text;
  v_existing_validated boolean;
  v_actual_expression text;
  v_expected_expression text;
begin
  select c.oid, c.contype::text, c.convalidated
    into v_existing_oid, v_existing_type, v_existing_validated
    from pg_constraint c
   where c.conrelid = 'public.seeker_resume_experiences'::regclass
     and c.conname = 'seeker_resume_experiences_identity_chk';

  if not found then
    execute format(
      'alter table public.seeker_resume_experiences add constraint seeker_resume_experiences_identity_chk check (%s) not valid',
      v_identity_expression
    );
  else
    if v_existing_type <> 'c' or v_existing_validated then
      raise exception
        'migration 093: seeker_resume_experiences_identity_chk has an unexpected type or validation state';
    end if;

    -- Ask PostgreSQL to parse the canonical expression against a throwaway
    -- table, then compare its normalized catalog form with the deployed one.
    -- This avoids accepting a same-name constraint with weaker AND/OR or
    -- whitespace semantics while remaining independent of pretty-printing.
    create temporary table migration_093_resume_identity_probe (
      role_title text,
      company_name text
    ) on commit drop;

    execute format(
      'alter table pg_temp.migration_093_resume_identity_probe add constraint migration_093_resume_identity_expected_chk check (%s) not valid',
      v_identity_expression
    );

    select pg_get_expr(c.conbin, c.conrelid, false)
      into strict v_actual_expression
      from pg_constraint c
     where c.oid = v_existing_oid;

    select pg_get_expr(c.conbin, c.conrelid, false)
      into strict v_expected_expression
      from pg_constraint c
     where c.conrelid = 'pg_temp.migration_093_resume_identity_probe'::regclass
       and c.conname = 'migration_093_resume_identity_expected_chk';

    if translate(lower(v_actual_expression), E' \t\n\r', '')
       is distinct from
       translate(lower(v_expected_expression), E' \t\n\r', '') then
      raise exception
        'migration 093: seeker_resume_experiences_identity_chk has an unexpected definition';
    end if;
  end if;
end;
$do$;

comment on constraint seeker_resume_experiences_identity_chk
  on public.seeker_resume_experiences is
  'New and updated experience rows require a role title or employer/place after applying the ECMAScript trim whitespace set. Historical invalid rows remain unvalidated until separately repaired.';

create or replace function private.application_resume_is_complete(
  p_seeker_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with ecmascript_trim_characters(value) as (
    values (
      concat(
        chr(9), chr(10), chr(11), chr(12), chr(13), chr(32),
        chr(160), chr(5760),
        chr(8192), chr(8193), chr(8194), chr(8195), chr(8196),
        chr(8197), chr(8198), chr(8199), chr(8200), chr(8201),
        chr(8202), chr(8232), chr(8233), chr(8239), chr(8287),
        chr(12288), chr(65279)
      )
    )
  )
  select exists (
    select 1
    from public.seeker_profiles sp
    cross join ecmascript_trim_characters trim_characters
    where sp.id = p_seeker_profile_id
      and sp.deleted_at is null
      and nullif(
        btrim(coalesce(sp.display_name, ''), trim_characters.value),
        ''
      ) is not null
      and nullif(
        btrim(coalesce(sp.relative_location, ''), trim_characters.value),
        ''
      ) is not null
      and nullif(
        btrim(coalesce(sp.seeking_timeline, ''), trim_characters.value),
        ''
      ) is not null
      and (
        cardinality(coalesce(sp.general_skill_tags, '{}'::text[])) > 0
        or exists (
          select 1
          from public.seeker_resume_experiences experience
          where experience.seeker_profile_id = sp.id
            and (
              nullif(
                btrim(
                  coalesce(experience.role_title, ''),
                  trim_characters.value
                ),
                ''
              ) is not null
              or nullif(
                btrim(
                  coalesce(experience.company_name, ''),
                  trim_characters.value
                ),
                ''
              ) is not null
            )
            and cardinality(coalesce(experience.skill_tags, '{}'::text[])) > 0
        )
      )
      and (
        nullif(
          btrim(coalesce(sp.short_bio, ''), trim_characters.value),
          ''
        ) is not null
        or exists (
          select 1
          from public.seeker_resume_experiences experience
          where experience.seeker_profile_id = sp.id
            and (
              nullif(
                btrim(
                  coalesce(experience.role_title, ''),
                  trim_characters.value
                ),
                ''
              ) is not null
              or nullif(
                btrim(
                  coalesce(experience.company_name, ''),
                  trim_characters.value
                ),
                ''
              ) is not null
            )
        )
      )
  )
$$;

revoke execute on function private.application_resume_is_complete(uuid)
  from public, anon, authenticated, service_role;

comment on function private.application_resume_is_complete(uuid) is
  'Database-authoritative application resume gate. Text presence uses the ECMAScript trim whitespace set; only experiences with a meaningful role title or employer/place may contribute identity or skills.';

commit;
