-- SP8 touchpoints on SP2 tables: operator trial days, media ids stored in JSON, and the
-- verification review subject.
create function app.jsonb_uuid_strings(j jsonb) returns uuid[]
language sql immutable parallel safe as $$
  select coalesce(array_agg(distinct (v #>> '{}')::uuid order by (v #>> '{}')::uuid), '{}')
  from jsonb_path_query(coalesce(j, '{}'::jsonb), 'strict $.**') v
  where jsonb_typeof(v) = 'string'
    and (v #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

alter table app.subscriptions
  add column operator_trial_days int not null default 0
    check (operator_trial_days between 0 and 3650),
  add column free_until timestamptz;

alter table app.listings
  add column draft_media_ids uuid[]
    generated always as (app.jsonb_uuid_strings(draft)) stored;
alter table app.listing_revisions
  add column content_media_ids uuid[]
    generated always as (app.jsonb_uuid_strings(content)) stored;
alter table app.host_pages
  add column content_media_ids uuid[]
    generated always as (app.jsonb_uuid_strings(content)) stored,
  add column pending_media_ids uuid[]
    generated always as (app.jsonb_uuid_strings(pending_content)) stored;

-- Verification items move off the organization subject. An appeal follows its original item.
update app.review_items
set subject_type = 'business_verification'
where subject_type = 'organization'
  and (
    id in (
      select review_item_id from app.business_verifications where review_item_id is not null
    )
    or original_item_id in (
      select review_item_id from app.business_verifications where review_item_id is not null
    )
  );

-- A generated column is still null inside a BEFORE trigger, so the immutability check must
-- ignore it. The stored content is still compared, and the column is rebuilt from that content.
create or replace function app.listing_revision_immutable() returns trigger
language plpgsql as $$
begin
  if old.status not in ('approved', 'superseded') then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'updated_at' - 'submitted_by' - 'content_media_ids')
       is distinct from
     (to_jsonb(old) - 'status' - 'updated_at' - 'submitted_by' - 'content_media_ids')
     or (new.submitted_by is distinct from old.submitted_by and new.submitted_by is not null) then
    raise exception 'listing revision % is immutable once approved', old.id
      using errcode = 'check_violation';
  end if;
  if new.status <> old.status and not (old.status = 'approved' and new.status = 'superseded') then
    raise exception 'listing revision % is immutable once approved (% -> % not allowed)',
      old.id, old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
