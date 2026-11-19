-- 2100_landing (SP3 W0, owned by W8): operator copy overrides for landing pages. A page without
-- a row uses generated copy (SP3 spec sections 4 and 8.11).

-- key examples: state:alaska, category:farm, category_state:farm:california,
-- category_genre:seasonal:ski-resorts, season:summer, destination:yellowstone, international.
create table app.landing_pages (
  key text primary key,
  kind text not null check (kind in
    ('state', 'category', 'category_state', 'category_genre', 'season', 'destination',
     'international')),
  title text not null check (char_length(title) between 1 and 80),
  intro text not null default '' check (char_length(intro) <= 1200),
  hero_media_id uuid,
  hero_alt text check (char_length(hero_alt) <= 150),
  seo_title text check (char_length(seo_title) <= 60),
  seo_description text check (char_length(seo_description) <= 160),
  -- The operator who last saved the copy; nulled when that user is erased (SP8).
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.landing_pages enable row level security;
create trigger landing_pages_set_updated_at before update on app.landing_pages
  for each row execute function app.set_updated_at();
