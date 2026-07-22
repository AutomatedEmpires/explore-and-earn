do $$
begin
  if (select status from public.listings
       where id = '72000000-0000-0000-0000-000000000003') <> 'draft' then
    raise exception 'upgrade assertion: unsupported legacy live listing did not return to draft';
  end if;
  if (select paused_at from public.listings
       where id = '72000000-0000-0000-0000-000000000003') is null then
    raise exception 'upgrade assertion: paused legacy listing was not timestamped';
  end if;
  if (select status from public.listings
       where id = '72000000-0000-0000-0000-000000000004') <> 'under_review' then
    raise exception 'upgrade assertion: unprovable complete live listing did not return to review';
  end if;
  if (select status from public.listings
       where id = '72000000-0000-0000-0000-000000000005') <> 'draft' then
    raise exception 'upgrade assertion: unmoderated legacy listing did not return to draft';
  end if;
  if (select status from public.listings
       where id = '72000000-0000-0000-0000-000000000007') <> 'live' then
    raise exception 'upgrade assertion: sourced listing left its separate lifecycle';
  end if;
  if (select status from public.listings
       where id = '72000000-0000-0000-0000-000000000008') <> 'draft' then
    raise exception 'upgrade assertion: unprovable paused listing did not return to draft';
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
   '72000000-0000-0000-0000-000000000004',
   '72000000-0000-0000-0000-000000000005',
   '72000000-0000-0000-0000-000000000007',
   '72000000-0000-0000-0000-000000000008'
 )
 order by id;
