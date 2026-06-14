-- 032_community_phase3.sql
-- Real engagement: DB-backed reactions on photos + announcements, flat comment threads.
--
-- Scope:
--   1. community_photo_reactions       — per-user emoji reactions on photos
--   2. community_announcement_reactions — per-user emoji reactions on announcements
--   3. community_comments              — polymorphic flat comment threads

begin;

/* ── 1. community_photo_reactions ────────────────────────────────────────── */

create table public.community_photo_reactions (
  id             uuid        primary key default gen_random_uuid(),
  photo_id       uuid        not null references public.community_photos(id) on delete cascade,
  clerk_user_id  text        not null,
  reaction       text        not null check (reaction in ('smile','heart','hundred','clap','sparkle')),
  created_at     timestamptz not null default now(),
  unique(photo_id, clerk_user_id, reaction)
);

create index idx_photo_reactions_photo
  on public.community_photo_reactions (photo_id);

alter table public.community_photo_reactions enable row level security;

create policy "photo_reactions_authenticated_read"
  on public.community_photo_reactions for select
  to authenticated using (true);

create policy "photo_reactions_owner_insert"
  on public.community_photo_reactions for insert
  to authenticated
  with check (clerk_user_id = auth.jwt() ->> 'sub');

create policy "photo_reactions_owner_delete"
  on public.community_photo_reactions for delete
  to authenticated
  using (clerk_user_id = auth.jwt() ->> 'sub');

/* ── 2. community_announcement_reactions ────────────────────────────────── */

create table public.community_announcement_reactions (
  id               uuid        primary key default gen_random_uuid(),
  announcement_id  uuid        not null references public.host_announcements(id) on delete cascade,
  clerk_user_id    text        not null,
  reaction         text        not null check (reaction in ('smile','heart','hundred','clap','sparkle')),
  created_at       timestamptz not null default now(),
  unique(announcement_id, clerk_user_id, reaction)
);

create index idx_ann_reactions_ann
  on public.community_announcement_reactions (announcement_id);

alter table public.community_announcement_reactions enable row level security;

create policy "ann_reactions_authenticated_read"
  on public.community_announcement_reactions for select
  to authenticated using (true);

create policy "ann_reactions_owner_insert"
  on public.community_announcement_reactions for insert
  to authenticated
  with check (clerk_user_id = auth.jwt() ->> 'sub');

create policy "ann_reactions_owner_delete"
  on public.community_announcement_reactions for delete
  to authenticated
  using (clerk_user_id = auth.jwt() ->> 'sub');

/* ── 3. community_comments ───────────────────────────────────────────────── */

create table public.community_comments (
  id             uuid        primary key default gen_random_uuid(),
  target_type    text        not null check (target_type in ('photo', 'announcement')),
  target_id      uuid        not null,
  clerk_user_id  text        not null,
  author_name    text        not null,
  body           text        not null check (char_length(body) <= 500),
  status         text        not null default 'active' check (status in ('active', 'removed')),
  created_at     timestamptz not null default now()
);

-- Feed: load comments for a target ordered oldest-first
create index idx_community_comments_target
  on public.community_comments (target_type, target_id, created_at)
  where status = 'active';

-- Author lookup for soft-delete gate
create index idx_community_comments_author
  on public.community_comments (clerk_user_id);

alter table public.community_comments enable row level security;

-- All authenticated users can read active comments
create policy "community_comments_authenticated_read"
  on public.community_comments for select
  to authenticated
  using (status = 'active');

-- Users can add comments (author_name validated in server action)
create policy "community_comments_owner_insert"
  on public.community_comments for insert
  to authenticated
  with check (clerk_user_id = auth.jwt() ->> 'sub');

-- Users can soft-delete their own comments
create policy "community_comments_owner_update"
  on public.community_comments for update
  to authenticated
  using (clerk_user_id = auth.jwt() ->> 'sub');

commit;
