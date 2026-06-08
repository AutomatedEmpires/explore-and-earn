# Cron Jobs Runbook

Operational reference for scheduled jobs in the Explore & Earn web app.

## expire-listings

Archives live listings whose expiry window has passed.

- **Endpoint:** `GET /api/cron/expire-listings`
- **Handler:** `apps/web/app/api/cron/expire-listings/route.ts`
- **Auth:** `Authorization: Bearer ${CRON_SECRET}` header. Missing/incorrect -> `401`.
- **Action:** sets `status = 'archived'` (and `archived_at = now()`) for every listing where `expires_at < now()` AND `status = 'live'`, using the service-role admin client (RLS-bypassing).
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
