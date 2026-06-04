-- 005_media.sql
-- Media buckets + assets. Enum CHECK values mirror contracts enums.ts
-- (MEDIA_OWNER_TYPE, MEDIA_BUCKET_TYPE full DB-level set, MEDIA_VISIBILITY,
-- MEDIA_MODERATION_STATUS, MEDIA_PROCESSING_STATUS). Moderation + processing
-- status changes are guarded by the lifecycle engine (G16).

create table media_buckets (
  id          uuid primary key default gen_random_uuid(),
  owner_type  text not null
                check (owner_type in ('host_profile','seeker_profile','listing','application','platform_post','travel_plan','identity_verification','dispute_case','refund_review','report_case','moderation_case')),
  owner_id    uuid not null,
  bucket_type text not null
                check (bucket_type in ('profile_gallery','cover_photo','icon_photo','housing','meals','facilities','listing_specific','community_photo','travel_attachment','verification_evidence','dispute_evidence','report_evidence')),
  title       text,
  description text,
  visibility  text not null default 'owner_team'
                check (visibility in ('private','owner_team','authenticated','public')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_media_buckets_owner on media_buckets (owner_type, owner_id);
create index idx_media_buckets_bucket_type on media_buckets (bucket_type);

create trigger trg_media_buckets_updated_at
  before update on media_buckets
  for each row execute function set_updated_at();

create table media_assets (
  id                  uuid primary key default gen_random_uuid(),
  -- NOT NULL + ON DELETE RESTRICT (not SET NULL): every asset belongs to exactly
  -- one bucket, and a bucket cannot be deleted while it still owns assets.
  -- Nulling/orphaning bucket_id would silently break the
  -- listing_media_overrides / cover_asset_id invariants (which require every
  -- referenced asset to live in a listing-owned bucket). Admins must remove the
  -- assets first (that cascades to overrides) before deleting a bucket.
  bucket_id           uuid not null references media_buckets(id) on delete restrict,
  uploaded_by_user_id uuid references auth.users(id),
  storage_key         text not null,
  asset_type          text not null check (asset_type in ('image','video','document')),
  mime_type           text,
  caption             text,
  alt_text            text,
  sort_order          integer not null default 0,
  moderation_status   text not null default 'pending'
                        check (moderation_status in ('pending','under_review','approved','rejected','hidden','removed')),
  processing_status   text not null default 'uploaded'
                        check (processing_status in ('uploaded','processing','ready','failed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index idx_media_assets_bucket on media_assets (bucket_id);
create index idx_media_assets_uploaded_by on media_assets (uploaded_by_user_id);
create index idx_media_assets_moderation_status on media_assets (moderation_status);

create trigger trg_media_assets_updated_at
  before update on media_assets
  for each row execute function set_updated_at();

create trigger trg_media_assets_moderation_lifecycle
  before update on media_assets
  for each row
  when (old.moderation_status is distinct from new.moderation_status)
  execute function enforce_lifecycle_transition('media_moderation', 'moderation_status');

create trigger trg_media_assets_processing_lifecycle
  before update on media_assets
  for each row
  when (old.processing_status is distinct from new.processing_status)
  execute function enforce_lifecycle_transition('media_processing', 'processing_status');
