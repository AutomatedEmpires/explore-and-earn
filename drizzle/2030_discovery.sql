-- 2030_discovery (EE-Q3, issue 84): indexes for the map bbox cast and the event jobs that
-- filter on occurred_at alone.
-- 2000's GiST is on geog, so `geog::geometry && ST_MakeEnvelope` cannot use it.
-- The nightly rollup, backfill, scrub and retention filter by occurred_at with no leading
-- org or listing column. The scrub also requires a hash or dedupe key that is still set.

create index discovery_listings_geog_geom_idx
  on app.discovery_listings using gist ((geog::geometry))
  where is_active;

create index listing_events_occurred_idx on app.listing_events (occurred_at);

create index listing_events_scrub_idx on app.listing_events (occurred_at)
  where viewer_hash is not null or dedupe_key is not null;
