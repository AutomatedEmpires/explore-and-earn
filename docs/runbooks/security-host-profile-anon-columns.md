# Runbook: host_profiles anon column privacy

Applies to migration `supabase/migrations/027_host_profiles_anon_column_privacy.sql`.

Operational guide to verify the fix in a reproducible environment and to apply
it to production (founder-operated).

## Background

Row Level Security is row-level only. The `host_profiles_select_public` policy
(migration 013) exposes every COLUMN of any host row that has a `status='live'`
listing to the `anon` role. That over-exposes sensitive columns to
unauthenticated visitors. Migration 027 adds the missing column dimension with
PostgreSQL column-level `SELECT` privileges on the `anon` role.

Public-safe columns granted to `anon`:

```
id, company_name, host_name, tagline, about, primary_location_name,
photo_url, website_url, social_links, category_scopes,
housing_offered_generally, meals_offered_generally, attestation_status,
created_at, updated_at
```

Withheld from `anon` (previously leaked): `owner_user_id`, `clerk_user_id`,
`primary_latitude`, `primary_longitude`, `account_status`, `removed_at`,
`removed_reason_code`, `removed_by_user_id`, `removed_notes`, `attested_at`,
`attestation_expires_at`, `current_attestation_id`, `public_status`,
`completion_score`, `trust_status`, `subscription_tier`, `slug`,
`operating_regions`, `logo_asset_id`, `cover_asset_id`.

## 1. Verify in a fresh local database

```bash
# Rebuild the full migration lineage from scratch.
supabase db reset

# Confirm the anon role can read ONLY the public-safe columns.
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql "$DATABASE_URL" -c "\
  select column_name, privilege_type \
  from information_schema.role_column_grants \
  where grantee = 'anon' \
    and table_schema = 'public' \
    and table_name = 'host_profiles' \
  order by column_name;"
```

Acceptance: the result lists `SELECT` for exactly the 15 public-safe columns
above and NONE of the withheld columns.

## 2. Application smoke test (non-breaking check)

With the local stack running, confirm the anon read paths still work:

- `/host/[id]` public profile page renders (`getPublicHostProfile`).
- Discovery deck renders host company name + verified badge
  (`getPublicListings` embed `host_profiles(company_name, attestation_status)`).
- `/sitemap.xml` generates (anon `host_profiles(id, updated_at)` read).

All three select only public-safe columns, so they must succeed. An anon request
for a withheld column (e.g. `host_profiles?select=owner_user_id`) must now fail
with `permission denied for table host_profiles` / column.

## 3. Production apply (FOUNDER-OPERATED)

This PR does **not** apply anything to prod. After review, the founder applies
migration 027 to production using the standard apply path, then re-runs the
step 1 column-grant check against the prod connection string (read-only).

Note: unlike the function-grant re-arm that affected migration 023, table column
grants are not re-armed by the schema default-privilege ACL, so no extra
default-privilege reconciliation is required here.

## 4. Residual (tracked follow-up)

An AUTHENTICATED non-owner can still over-read sensitive columns of any
live-listing host: the `authenticated` role keeps a table-wide SELECT because it
legitimately needs full columns on its OWN row, and column grants are
role-global. Closing that requires routing cross-host public reads through a
private-schema function/view. Tracked in
`docs/security/host-profile-anon-column-privacy.md`.

## 5. Rollback

Migration 027 only adjusts column grants for the `anon` role; it creates no
objects. To roll back, re-grant table-wide SELECT to anon in a new
founder-authored migration:

```sql
grant select on table public.host_profiles to anon;
```

Rollback is not expected to be needed; the change is least-privilege tightening.
