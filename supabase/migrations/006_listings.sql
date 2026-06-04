-- 006_listings.sql
-- Canonical listing object + category-depth extensions + listing media
-- overrides.
--
-- Canon honored:
--   DR-B6: listings.mix_domains text[] constrained to the four non-mix domains
--     (and rejects NULL elements); only a `mix` listing may carry mix_domains.
--   DR-B3: money stored as integer cents (compensation_*_cents).
--   G7: ONE listing object across categories (no per-category tables);
--     category depth lives in listing_relevance_extensions.
--   Discovery Card triad (Housing/Meals/Pay) is first-class; NO generic perks
--     bucket on listings.
--   DR-B1 text+CHECK (mirrors LISTING_STATUS / LISTING_CATEGORY / COMPENSATION_
--     UNIT / FILLED_STATUS), DR-B2 uuid PK.
-- Listing status has no canonical transition map in the contracts yet, so no
-- lifecycle guard is attached (consistent with the foundation note).

create table listings (
  id                    uuid primary key default gen_random_uuid(),
  host_profile_id       uuid not null references host_profiles(id) on delete cascade,
  title                 text not null,
  category              text not null
                          check (category in ('farm','maritime','remote','seasonal','mix')),
  mix_domains           text[] not null default '{}'
                          check (
                            mix_domains <@ array['farm','maritime','remote','seasonal']::text[]
                            and array_position(mix_domains, null) is null
                          ),
  status                text not null default 'draft'
                          check (status in ('draft','under_review','live','paused','closed','archived')),
  description           text,
  location_display      text,
  latitude              numeric,
  longitude             numeric,
  is_remote             boolean not null default false,
  begins_at             timestamptz,
  ends_at               timestamptz,
  timeline_summary      text,
  compensation_min_cents integer
                          check (compensation_min_cents is null or compensation_min_cents >= 0),
  compensation_max_cents integer
                          check (compensation_max_cents is null or compensation_max_cents >= 0),
  compensation_currency text not null default 'USD',
  compensation_unit     text
                          check (compensation_unit in ('hour','day','week','month','year','stipend','exchange','other')),
  compensation_summary  text,
  housing_included      boolean not null default false,
  meals_included        boolean not null default false,
  visa_support          boolean not null default false,
  role_count            integer not null default 1 check (role_count >= 1),
  accepted_count        integer not null default 0 check (accepted_count >= 0),
  remaining_role_count  integer not null default 1 check (remaining_role_count >= 0),
  tags                  text[] not null default '{}',
  -- cover_asset_id FKs media_assets so it can't dangle; ON DELETE SET NULL keeps
  -- the listing if the cover asset is removed. enforce_listing_cover_asset()
  -- additionally requires the asset to live in THIS listing's cover_photo bucket.
  cover_asset_id        uuid references media_assets(id) on delete set null,
  completion_score      integer not null default 0 check (completion_score between 0 and 100),
  filled_status         text not null default 'open'
                          check (filled_status in ('open','partially_filled','filled','overfilled')),
  published_at          timestamptz,
  paused_at             timestamptz,
  closed_at             timestamptz,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint listings_mix_domains_only_for_mix check (
    cardinality(mix_domains) = 0 or category = 'mix'
  ),
  constraint listings_compensation_range_chk check (
    compensation_min_cents is null
    or compensation_max_cents is null
    or compensation_max_cents >= compensation_min_cents
  ),
  constraint listings_timeline_range_chk check (
    begins_at is null or ends_at is null or ends_at >= begins_at
  ),
  -- Keep the redundant availability counters internally consistent.
  constraint listings_role_counts_chk check (
    accepted_count <= role_count
    and remaining_role_count = role_count - accepted_count
  )
);

create index idx_listings_host on listings (host_profile_id);
create index idx_listings_category on listings (category);
create index idx_listings_status on listings (status);
create index idx_listings_published_at on listings (published_at);
create index idx_listings_begins_at on listings (begins_at);
create index idx_listings_ends_at on listings (ends_at);
create index idx_listings_housing_included on listings (housing_included);
create index idx_listings_meals_included on listings (meals_included);
create index idx_listings_tags on listings using gin (tags);
create index idx_listings_mix_domains on listings using gin (mix_domains);

create trigger trg_listings_updated_at
  before update on listings
  for each row execute function set_updated_at();

create table listing_relevance_extensions (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references listings(id) on delete cascade,
  type             text not null
                     check (type in ('farm','maritime','remote','seasonal','mix')),
  structured_data  jsonb not null default '{}'::jsonb,
  completion_score integer not null default 0 check (completion_score between 0 and 100),
  display_enabled  boolean not null default true,
  matching_enabled boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint listing_relevance_extensions_listing_type_unique unique (listing_id, type)
);

create index idx_listing_relevance_extensions_listing on listing_relevance_extensions (listing_id);

create trigger trg_listing_relevance_extensions_updated_at
  before update on listing_relevance_extensions
  for each row execute function set_updated_at();

create table listing_media_overrides (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references listings(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  -- Narrowed to the user-uploaded listing-media buckets defined by
  -- packages/contracts/src/media.ts (MEDIA_BUCKET_TYPES). The broader
  -- media_buckets registry (icon_photo, travel/dispute/report evidence, etc.)
  -- is intentionally NOT permitted as a listing override, to keep sensitive or
  -- non-listing media out of listing galleries. The bucket value is further
  -- enforced against the referenced asset's bucket by
  -- enforce_listing_media_override() below.
  bucket_type    text not null
                   check (bucket_type in ('housing','meals','facilities','cover_photo','community_photo','verification_evidence')),
  caption        text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_listing_media_overrides_listing on listing_media_overrides (listing_id);
create index idx_listing_media_overrides_bucket_type on listing_media_overrides (bucket_type);
create index idx_listing_media_overrides_asset on listing_media_overrides (media_asset_id);

create trigger trg_listing_media_overrides_updated_at
  before update on listing_media_overrides
  for each row execute function set_updated_at();

-- Integrity guard: an override may only reference an asset whose media bucket is
-- owned by THIS listing and whose bucket_type matches the override. The narrow
-- column CHECK alone cannot stop an asset from a sensitive bucket (e.g.
-- dispute_evidence) being relabeled as a listing photo, so validate against the
-- referenced asset's actual bucket here. SECURITY DEFINER (with an empty,
-- schema-qualified search_path) keeps the SELECTs against media_assets /
-- media_buckets working once the RLS migration restricts those tables; EXECUTE
-- is revoked from PUBLIC so it only runs via the trigger.
create or replace function enforce_listing_media_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_type  text;
  v_owner_id    uuid;
  v_bucket_type text;
begin
  select b.owner_type, b.owner_id, b.bucket_type
    into v_owner_type, v_owner_id, v_bucket_type
    from public.media_assets a
    join public.media_buckets b on b.id = a.bucket_id
   where a.id = new.media_asset_id;

  if not found then
    raise exception
      'listing_media_overrides: media asset % is not attached to a media bucket',
      new.media_asset_id
      using errcode = '23514';
  end if;

  if v_owner_type <> 'listing' or v_owner_id <> new.listing_id then
    raise exception
      'listing_media_overrides: media asset % belongs to %/%, not listing %',
      new.media_asset_id, v_owner_type, v_owner_id, new.listing_id
      using errcode = '23514';
  end if;

  if v_bucket_type is distinct from new.bucket_type then
    raise exception
      'listing_media_overrides: bucket_type % does not match the asset bucket %',
      new.bucket_type, v_bucket_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function enforce_listing_media_override() from public;

create trigger trg_listing_media_overrides_validate
  before insert or update on listing_media_overrides
  for each row execute function enforce_listing_media_override();

-- Mirror the override guard for the canonical cover image. cover_asset_id (when
-- set) must reference an asset that lives in THIS listing's own cover_photo
-- bucket, so the most visible listing surface can't point at a foreign or
-- sensitive asset. SECURITY DEFINER + empty search_path + EXECUTE revoked from
-- PUBLIC, same as the override guard.
create or replace function enforce_listing_cover_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_type  text;
  v_owner_id    uuid;
  v_bucket_type text;
begin
  if new.cover_asset_id is null then
    return new;
  end if;

  select b.owner_type, b.owner_id, b.bucket_type
    into v_owner_type, v_owner_id, v_bucket_type
    from public.media_assets a
    join public.media_buckets b on b.id = a.bucket_id
   where a.id = new.cover_asset_id;

  if not found then
    raise exception
      'listings: cover_asset_id % is not attached to a media bucket',
      new.cover_asset_id
      using errcode = '23514';
  end if;

  if v_owner_type <> 'listing' or v_owner_id <> new.id then
    raise exception
      'listings: cover_asset_id % is not owned by listing %',
      new.cover_asset_id, new.id
      using errcode = '23514';
  end if;

  if v_bucket_type <> 'cover_photo' then
    raise exception
      'listings: cover_asset_id % must come from a cover_photo bucket (got %)',
      new.cover_asset_id, v_bucket_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function enforce_listing_cover_asset() from public;

create trigger trg_listings_cover_asset_validate
  before insert or update on listings
  for each row execute function enforce_listing_cover_asset();
