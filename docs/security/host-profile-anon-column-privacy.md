# host_profiles anon column over-exposure (P0 #1)

**Status:** fix authored review-only in migration `027_host_profiles_anon_column_privacy.sql`; not applied to any live DB by this PR.

## Summary

The `host_profiles` table is reachable by the unauthenticated `anon` role via
PostgREST. Migration 013's row policy `host_profiles_select_public` grants the
`anon` role SELECT on any host row that has a `status='live'` listing:

```sql
create policy host_profiles_select_public on public.host_profiles
  for select to anon, authenticated
  using (exists (select 1 from public.listings l
                 where l.host_profile_id = host_profiles.id
                   and l.status = 'live'));
```

Row Level Security is **row-level only** - it cannot restrict which COLUMNS a
grantee reads. Because the `anon` role also holds a table-wide `SELECT` grant
(Supabase default), any unauthenticated visitor could read **every column** of a
live-listing host, including:

| Column | Why it must not be public |
| --- | --- |
| `owner_user_id` | Internal Supabase auth UUID (FK to auth.users). |
| `clerk_user_id` | Internal Clerk identity. |
| `primary_latitude`, `primary_longitude` | Exact geocoordinates (only coarse `primary_location_name` should be public). |
| `account_status`, `removed_at`, `removed_reason_code`, `removed_by_user_id`, `removed_notes` | Internal moderation / lifecycle state. |
| `attested_at`, `attestation_expires_at`, `current_attestation_id` | Trust-pipeline internals. |
| `public_status`, `completion_score`, `trust_status` | Internal scoring / workflow state. |
| `subscription_tier` | Commercial / billing signal. |

## Severity

**P0** for the `anon` (public-internet, unauthenticated) audience: the data is
reachable by anyone on the internet with the public anon key, with no login.

## Fix (this PR)

Migration `027` adds the missing **column dimension** using PostgreSQL
column-level privileges on the `anon` role: revoke the table-wide `SELECT`, then
re-grant `SELECT` on only the public-safe columns (`id`, `company_name`,
`host_name`, `tagline`, `about`, `primary_location_name`, `photo_url`,
`website_url`, `social_links`, `category_scopes`, `housing_offered_generally`,
`meals_offered_generally`, `attestation_status`, `created_at`, `updated_at`).
The `host_profiles_select_public` row policy is unchanged.

### Why column grants rather than a public view

The discovery feed relies on the PostgREST FK embed
`listings -> host_profiles(company_name, attestation_status)`. Replacing the
table with a view would break that embed. Column-level grants keep the FK
relationship and all existing anon queries working while removing the sensitive
columns. Verified non-breaking: every `anonClient` read selects an explicit
public-safe column list (see `packages/db/src/queries/hostProfiles.ts`,
`listings.ts`, and the sitemap generator).

### Role model (why owner reads are unaffected)

`anonClient()` connects as Postgres role `anon`. `authedClient(clerkToken)`
attaches the Clerk Supabase JWT, which carries `role=authenticated`, so it
connects as role `authenticated` - the role the 013 owner policies target. This
migration changes the `anon` role only, so owner/host-dashboard reads (which
need `subscription_tier` etc. on their own row) are untouched.

## Residual (tracked follow-up, NOT closed here)

An **authenticated non-owner** can still over-read sensitive columns of any
live-listing host, because the `authenticated` role retains a table-wide SELECT
(it needs full columns on its OWN row, and column grants are role-global, not
per-row). This is lower severity (requires a logged-in account) but real.

Closing it requires moving cross-host public reads behind a `private`-schema
function or a dedicated projection that the authenticated embeds
(invites/applications) and discovery read through, then dropping `authenticated`
from the broad `host_profiles_select_public` policy. Scoped to a follow-up PR to
keep this change surgical and independently reviewable/testable.

## Verification

See `docs/runbooks/security-host-profile-anon-columns.md`.
