-- ---------------------------------------------------------------------------
-- 057_listing_passes.sql
--
-- Persist swipe passes. The deck previously forgot every pass on unmount, so
-- passed cards resurfaced session after session — the flagship discovery
-- ritual had no memory. A pass is a real preference signal: it (1) keeps the
-- card out of future decks and (2) becomes the demotion input for future
-- ranking work.
--
-- Undo-friendly: the seeker may DELETE their own pass (the deck's Undo).
-- Additive & idempotent.
-- ---------------------------------------------------------------------------

create table if not exists public.listing_passes (
  seeker_profile_id uuid        not null references public.seeker_profiles(id) on delete cascade,
  listing_id        uuid        not null references public.listings(id)        on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (seeker_profile_id, listing_id)
);

create index if not exists idx_listing_passes_seeker
  on public.listing_passes (seeker_profile_id, created_at desc);

alter table public.listing_passes enable row level security;

drop policy if exists listing_passes_select_own on public.listing_passes;
create policy listing_passes_select_own on public.listing_passes
  for select to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists listing_passes_insert_own on public.listing_passes;
create policy listing_passes_insert_own on public.listing_passes
  for insert to authenticated
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists listing_passes_delete_own on public.listing_passes;
create policy listing_passes_delete_own on public.listing_passes
  for delete to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()));
