-- assert_resume_experience_identity.sql
-- Connected proof for migration 093. It exercises the deployed constraint and
-- function directly inside one rollback-only transaction. It never replaces
-- either object with a test copy.

\set ON_ERROR_STOP on

begin;

\ir _assert_helpers.sql

insert into public.seeker_profiles (
  id, clerk_user_id, display_name, short_bio, relative_location,
  seeking_timeline, general_skill_tags
)
values
  (
    '93001000-0000-4000-8000-000000000001',
    'user_resume_identity_role',
    'Role-only Seeker', null, 'Bend, OR', 'now', '{}'
  ),
  (
    '93001000-0000-4000-8000-000000000002',
    'user_resume_identity_company',
    'Employer-only Seeker', null, 'Yakima, WA', '1_month', '{}'
  ),
  (
    '93001000-0000-4000-8000-000000000003',
    'user_resume_identity_tab_profile',
    concat(chr(9), chr(10), chr(11), chr(12), chr(13)),
    'Has a real bio.', 'Bend, OR', 'now', array['Harvesting']
  ),
  (
    '93001000-0000-4000-8000-000000000004',
    'user_resume_identity_unicode_location',
    'Unicode Location Seeker', 'Has a real bio.',
    concat(
      chr(160), chr(5760), chr(8192), chr(8202), chr(8232),
      chr(8233), chr(8239), chr(8287), chr(12288), chr(65279)
    ),
    'now', array['Harvesting']
  ),
  (
    '93001000-0000-4000-8000-000000000005',
    'user_resume_identity_unicode_bio',
    'Unicode Bio Seeker',
    concat(
      chr(160), chr(5760), chr(8192), chr(8202), chr(8232),
      chr(8233), chr(8239), chr(8287), chr(12288), chr(65279)
    ),
    'Bend, OR', 'now', array['Harvesting']
  );

-- Exact catalog proof: the deployed compatibility constraint must be the
-- canonical OR of role/company ECMAScript-trim predicates. The private
-- application predicate is pinned by a normalized-source hash in addition to
-- its security properties, so changing AND/OR structure cannot false-pass.
do $do$
declare
  v_constraint_expression text;
  v_constraint_validated boolean;
  v_function_oid oid;
  v_function_source text;
begin
  select pg_get_expr(c.conbin, c.conrelid, false), c.convalidated
    into strict v_constraint_expression, v_constraint_validated
    from pg_constraint c
   where c.conrelid = 'public.seeker_resume_experiences'::regclass
     and c.conname = 'seeker_resume_experiences_identity_chk'
     and c.contype = 'c';

  if v_constraint_validated then
    raise exception 'resume identity: compatibility constraint was unexpectedly validated';
  end if;

  if md5(replace(
       translate(lower(v_constraint_expression), E' \t\n\r', ''),
       '::text',
       ''
     )) <> 'c004d6002c15e95d09fd72f5a8948bad' then
    raise exception 'resume identity: deployed constraint definition drifted';
  end if;

  select p.oid, p.prosrc
    into strict v_function_oid, v_function_source
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.oid = 'private.application_resume_is_complete(uuid)'::regprocedure
     and p.prosecdef
     and p.provolatile = 's'
     and 'search_path=""' = any(coalesce(p.proconfig, '{}'::text[]));

  if md5(translate(lower(v_function_source), E' \t\n\r', ''))
     <> '0f6012420b869f71406298a9897bad90' then
    raise exception 'resume identity: application predicate definition drifted';
  end if;

  if has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_function_oid, 'EXECUTE')
     or exists (
       select 1
         from pg_proc p,
              lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = v_function_oid
          and a.grantee = 0
          and a.privilege_type = 'EXECUTE'
     ) then
    raise exception 'resume identity: private predicate is executable by an API role';
  end if;
end;
$do$;

select pg_temp.expect_rows(
  'tab and line-terminator profile text does not complete resume',
  $q$select 1 where private.application_resume_is_complete(
    '93001000-0000-4000-8000-000000000003'
  )$q$,
  0
);
select pg_temp.expect_rows(
  'unicode whitespace profile location does not complete resume',
  $q$select 1 where private.application_resume_is_complete(
    '93001000-0000-4000-8000-000000000004'
  )$q$,
  0
);
select pg_temp.expect_rows(
  'unicode whitespace profile bio does not complete resume',
  $q$select 1 where private.application_resume_is_complete(
    '93001000-0000-4000-8000-000000000005'
  )$q$,
  0
);
select pg_temp.checkpoint_section('profile whitespace truth', 3);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"user_resume_identity_role","role":"authenticated"}';

select pg_temp.expect_denied(
  'authenticated tab and line-terminator experience identity is rejected',
  $q$insert into public.seeker_resume_experiences (
    seeker_profile_id, role_title, company_name, summary, skill_tags
  ) values (
    '93001000-0000-4000-8000-000000000001',
    concat(chr(9), chr(10), chr(11), chr(12), chr(13)),
    null, 'Still not identity.', array['Harvesting']
  )$q$,
  'seeker_resume_experiences_identity_chk',
  '23514'
);
select pg_temp.expect_denied(
  'authenticated unicode whitespace experience identity is rejected',
  $q$insert into public.seeker_resume_experiences (
    seeker_profile_id, role_title, company_name, summary, skill_tags
  ) values (
    '93001000-0000-4000-8000-000000000001',
    null,
    concat(
      chr(160), chr(5760),
      chr(8192), chr(8193), chr(8194), chr(8195), chr(8196),
      chr(8197), chr(8198), chr(8199), chr(8200), chr(8201),
      chr(8202), chr(8232), chr(8233), chr(8239), chr(8287),
      chr(12288), chr(65279)
    ),
    'Still not identity.', array['Harvesting']
  )$q$,
  'seeker_resume_experiences_identity_chk',
  '23514'
);
select pg_temp.expect_allowed(
  'authenticated role-only experience insert succeeds',
  $q$insert into public.seeker_resume_experiences (
    id, seeker_profile_id, role_title, company_name, skill_tags
  ) values (
    '93002000-0000-4000-8000-000000000001',
    '93001000-0000-4000-8000-000000000001',
    concat(chr(65279), 'Orchard Guide', chr(12288)), null,
    array['Harvesting']
  )$q$
);

set local request.jwt.claims =
  '{"sub":"user_resume_identity_company","role":"authenticated"}';

select pg_temp.expect_allowed(
  'authenticated employer-only experience insert succeeds',
  $q$insert into public.seeker_resume_experiences (
    id, seeker_profile_id, role_title, company_name, skill_tags
  ) values (
    '93002000-0000-4000-8000-000000000002',
    '93001000-0000-4000-8000-000000000002',
    null, concat(chr(160), 'Sunrise Orchard', chr(65279)),
    array['Harvesting']
  )$q$
);
select pg_temp.checkpoint_section('authenticated write boundary', 4);

reset role;
set local request.jwt.claims = '{}';

select pg_temp.expect_rows(
  'role-only experience completes resume',
  $q$select 1 where private.application_resume_is_complete(
    '93001000-0000-4000-8000-000000000001'
  )$q$,
  1
);
select pg_temp.expect_rows(
  'employer-only experience completes resume',
  $q$select 1 where private.application_resume_is_complete(
    '93001000-0000-4000-8000-000000000002'
  )$q$,
  1
);
select pg_temp.checkpoint_section('role and employer truth', 2);

select pg_temp.assert_suite_complete(
  'resume experience identity',
  3,
  4,
  5
);

rollback;
