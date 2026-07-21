\set ON_ERROR_STOP on

do $$
begin
  if (select status from public.listings
       where id = '72000000-0000-0000-0000-000000000003') <> 'paused' then
    raise exception 'upgrade assertion: unsupported legacy live listing was not paused';
  end if;
  if (select paused_at from public.listings
       where id = '72000000-0000-0000-0000-000000000003') is null then
    raise exception 'upgrade assertion: paused legacy listing was not timestamped';
  end if;
  if (select status from public.listings
       where id = '72000000-0000-0000-0000-000000000004') <> 'live' then
    raise exception 'upgrade assertion: complete legacy listing was unnecessarily paused';
  end if;
  if exists (
    select 1
      from public.listings l
     where l.provenance <> 'sourced'
       and l.status in ('under_review', 'live')
       and l.housing_included = true
       and coalesce(array_length(
         private.missing_housing_photo_roles(
           l.host_profile_id,
           l.id,
           coalesce(l.benefit_details, '{}'::jsonb),
           coalesce((
             select hp.benefit_library
               from public.host_profiles hp
              where hp.id = l.host_profile_id
           ), '{}'::jsonb)
         ),
         1
       ), 0) > 0
  ) then
    raise exception 'upgrade assertion: a public verified housing claim remains incomplete';
  end if;
end;
$$;

select id, status, published_at, paused_at
  from public.listings
 where id in (
   '72000000-0000-0000-0000-000000000003',
   '72000000-0000-0000-0000-000000000004'
 )
 order by id;
