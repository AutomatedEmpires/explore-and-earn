-- 0600_media: uploaded files and their scan state (W7, Task 20; spec section 7).
--
-- A file is uploaded into the private `quarantine` bucket (status `uploaded`), scanned by the
-- `media.scan` outbox job (`scanning`), and ends `approved` (in `media-public` or
-- `media-private`), `in_review` (held in `media-private` until an operator decides),
-- `rejected` (with a reason) or `blocked` (a child-safety match; the original is preserved in
-- the restricted `evidence` bucket).

create table app.media (
  id uuid primary key,
  owner_user_id uuid not null references app.users (id),
  owner_org_id uuid references app.organizations (id),
  kind text not null check (kind in (
    'avatar', 'cover', 'logo', 'listing_photo', 'housing_photo', 'meal_photo',
    'community_photo', 'resume', 'attachment'
  )),
  status text not null default 'uploaded' check (status in (
    'uploaded', 'scanning', 'in_review', 'approved', 'rejected', 'blocked'
  )),
  -- Where the file lives now: `quarantine` until scanned, then its final bucket.
  bucket text not null check (bucket in ('quarantine', 'media-public', 'media-private', 'evidence')),
  -- The object path in `bucket` (images: the folder holding the WebP variants).
  path text not null,
  -- What the uploader said the file is, and what its bytes say it is.
  declared_mime text not null,
  detected_mime text,
  -- Declared size at upload request; replaced by the real size when scanned.
  size_bytes int not null check (size_bytes > 0),
  sha256 text,
  width int check (width > 0),
  height int check (height > 0),
  alt_text text,
  -- Images: { "320": "<path>/320.webp", "640": ..., "1280": ... }.
  variants jsonb,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_rejected_has_reason
    check (status <> 'rejected' or rejection_reason is not null)
);

create index media_owner_user_idx on app.media (owner_user_id, id);
create index media_owner_org_idx on app.media (owner_org_id, id) where owner_org_id is not null;
create index media_status_idx on app.media (status, updated_at);

alter table app.media enable row level security;

create trigger media_set_updated_at
  before update on app.media
  for each row execute function app.set_updated_at();
