-- ---------------------------------------------------------------------------
-- 052_match_scores.sql
--
-- Pairwise match cache: the persisted output of the ADR-040 engine for a
-- (seeker, listing) pair. Moves scoring off the request path, powers host-side
-- applicant ranking and "new strong match" notifications, and lets recompute run
-- in the background.
--
-- G34: stores component SCORES (numbers) only — never explanation text. The
-- human-readable reason is derived at render time from the numeric components.
--
-- Additive & idempotent. Apply via the db-migrate pipeline on merge.
-- See docs/superpowers/specs/2026-07-02-matching-engine-design.md.
-- ---------------------------------------------------------------------------

create table if not exists public.match_scores (
  seeker_profile_id uuid        not null references public.seeker_profiles(id) on delete cascade,
  listing_id        uuid        not null references public.listings(id)        on delete cascade,
  score             smallint    not null check (score      between 0 and 100), -- post-caps
  raw_score         smallint    not null check (raw_score  between 0 and 100), -- pre-caps
  band              text        not null check (band in ('strong','developing','needs_attention')),
  confidence        smallint    not null check (confidence between 0 and 100),
  -- Numeric component breakdown ONLY (G34): {"categoryRoleFit":82,...}. No text.
  components        jsonb       not null default '{}'::jsonb,
  caps_applied      text[]      not null default '{}',
  computed_at       timestamptz not null default now(),
  primary key (seeker_profile_id, listing_id)
);

-- Seeker feed: top matches for a seeker, best first.
create index if not exists idx_match_scores_seeker_score
  on public.match_scores (seeker_profile_id, score desc);
-- Host applicant ranking: scores for a given listing.
create index if not exists idx_match_scores_listing
  on public.match_scores (listing_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Reads: a seeker sees only their own rows; a host sees rows for listings they
-- own (applicant ranking). Writes: service-role only (the matching service
-- computes + upserts; service role bypasses RLS, so no authenticated write
-- policy exists — parity with events / analytics sinks).
alter table public.match_scores enable row level security;

drop policy if exists match_scores_select_seeker on public.match_scores;
create policy match_scores_select_seeker on public.match_scores
  for select to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists match_scores_select_host on public.match_scores;
create policy match_scores_select_host on public.match_scores
  for select to authenticated
  using (listing_id in (select public.current_host_listing_ids()));
