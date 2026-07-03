# Cron Jobs Runbook

Operational reference for scheduled jobs in the Explore & Earn web app.

## expire-listings

Archives live listings whose expiry window has passed.

- **Endpoint:** `GET /api/cron/expire-listings`
- **Handler:** `apps/web/app/api/cron/expire-listings/route.ts`
- **Auth:** `Authorization: Bearer ${CRON_SECRET}` header. Missing/incorrect -> `401`.
- **Action:** calls `expireListings()` from `packages/db/src/queries/listingLifecycle.ts`, which:
  1. Asserts `canTransitionListing("live", "archived")` via the lifecycle engine (compile-time guard).
  2. Sets `status = 'archived'` and `archived_at = now()` for every listing where `expires_at < now()` AND `status = 'live'`, using the service-role admin client (RLS-bypassing).
  3. Is idempotent — already-archived rows are excluded by the `status = 'live'` filter, so repeated runs are safe.
- **Response:** `{ "ok": true, "archived": <number> }` on success.

### Expiry seeding

- `expires_at` is added by `supabase/migrations/022_listing_expiry.sql`.
- New listings get `expires_at = coalesce(begins_at, now()) + interval '90 days'` via the `trg_listings_set_expiry` BEFORE INSERT trigger when the caller does not set it.
- The migration backfills existing live listings as `begins_at + interval '90 days'`.

### Scheduling

Invoke on a daily schedule with the secret header (Vercel Cron or any external scheduler):

```
0 7 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<app-host>/api/cron/expire-listings
```

### Required environment

- `CRON_SECRET` — shared secret for the Bearer check.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key used by `adminClient()` (server-only secret, never `NEXT_PUBLIC_`).
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL.

## saved-search-alerts

Notifies seekers when new live listings match a saved search — the re-engagement flywheel.

- **Endpoint:** `GET /api/cron/saved-search-alerts`
- **Handler:** `apps/web/app/api/cron/saved-search-alerts/route.ts`
- **Auth:** `Authorization: Bearer ${CRON_SECRET}` header. Missing/incorrect -> `401`.
- **Action:** calls `runSavedSearchAlerts()` from `packages/db/src/queries/savedSearchAlerts.ts`, which, for every `alert_enabled` saved search (service-role):
  1. Re-runs the saved filter set against live listings.
  2. Selects listings published after the search's `last_alerted_at` (or its `created_at` on the first run) — the "new since you last looked" set.
  3. Inserts one in-app notification per search that has fresh matches (deep-linking to `/seek?<filters>`), then advances `last_alerted_at`.
  - Best-effort per search: one failure never blocks the batch. The high-water mark advances even when nothing is new, so runs never re-alert.
- **Response:** `{ "ok": true, "processed": n, "alerted": n, "listingsMatched": n }`.

### Scheduling

Daily (or a few times a day) with the secret header:

```
0 8 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<app-host>/api/cron/saved-search-alerts
```

## new-match-alerts

Notifies seekers when a newly-published listing is a **strong** ADR-040 match for them — proactive, fit-based re-engagement (the complement to filter-based saved-search alerts).

- **Endpoint:** `GET /api/cron/new-match-alerts`
- **Handler:** `apps/web/app/api/cron/new-match-alerts/route.ts`
- **Auth:** `Authorization: Bearer ${CRON_SECRET}` header. Missing/incorrect -> `401`.
- **Action:** calls `runNewMatchAlerts()` (`apps/web/services/matching/newMatchAlerts.ts`), which, service-role:
  1. Finds live listings published in the last 48h that have **no** `match_scores` rows yet (structural dedupe: a listing is scored + blasted at most once).
  2. Scores each against the active-seeker pool (bounded) via the ADR-040 engine and persists to `match_scores`.
  3. Notifies up to 25 seekers per listing who clear the strong-match floor (score ≥ 75), deep-linking to `/listing/{id}`. A per-`(listing, seeker)` `dedupe_key` prevents double-notifying.
  - Best-effort per listing: one failure never blocks the sweep.
- **Response:** `{ "ok": true, "listingsProcessed": n, "notified": n }`.

### Scheduling

A few times a day, with the secret header:

```
0 */6 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<app-host>/api/cron/new-match-alerts
```

Same required environment as `expire-listings` above.
