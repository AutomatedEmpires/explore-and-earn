# Migration ledger & repo-vs-prod reconciliation

> Source of truth for **what migration numbers exist, who owns them, and how repo state maps to production.**
> Machine-readable companion: [`tools/scripts/migration-allocations.json`](../../tools/scripts/migration-allocations.json), enforced by [`tools/scripts/check-migration-prefixes.mjs`](../../tools/scripts/check-migration-prefixes.mjs) via the `migration-guard` workflow.

## 1. Why this document exists

Parallel "lane" agents have repeatedly picked the **same migration number** at the same time. By the time this ledger was written, `main` carried **three duplicate numeric prefixes** and open PRs had introduced **three different `022_*` migrations**. Duplicate prefixes break ordered, deterministic migration application and make repo-vs-prod drift impossible to reason about.

This ledger plus the duplicate-prefix guard make the numbering authoritative and machine-checked.

## 2. Canonical migration sequence (post-fix, `main`)

| # | File | Topic |
|----|------|-------|
| 001 | `001_extensions_and_functions.sql` | Postgres extensions + shared functions |
| 002 | `002_users_profile_shadow.sql` | User/profile shadow table |
| 003 | `003_profiles.sql` | Profiles |
| 004 | `004_seeker_resume.sql` | Seeker resume |
| 005 | `005_media.sql` | Media |
| 006 | `006_listings.sql` | Listings |
| 007 | `007_applications_invites_offers.sql` | Applications / invites / offers |
| 008 | `008_notifications_events.sql` | Notifications + events |
| 009 | `009_clerk_user_sync_schema.sql` | Clerk user-sync schema |
| 010 | `010_messages.sql` | Messages |
| 011 | `011_conversations_unique_fix.sql` | Conversations unique constraint fix |
| 012 | `012_host_profiles_clerk_user_id.sql` | Host profiles Clerk user id |
| 013 | `013_rls_policies.sql` | RLS policies (core) |
| 014 | `014_notifications_clerk_user_id.sql` | Notifications Clerk user id |
| 015 | `015_rls_remaining_tables.sql` | RLS for remaining tables |
| 016 | `016_lock_down_security_definer_functions.sql` | Security: lock down `SECURITY DEFINER` functions (Lane A) |
| 017 | `017_storage_buckets.sql` | Storage buckets + storage RLS + url columns |
| 018 | `018_seeker_profile_fields.sql` | Seeker profile fields |
| 019 | `019_notification_prefs.sql` | Notification preferences |
| 020 | `020_composite_indexes.sql` | Composite indexes |
| 021 | `021_rls_complete.sql` | RLS completion pass |

After this PR, prefixes `001`–`021` are **unique**.

## 3. The duplicate-prefix problem and the fix

### Root cause

Earlier work moved migration *contents* forward by one number to dodge a collision, but left the **old, now-empty placeholder files** behind. Those placeholders contained only a comment ("Content moved to NNN_...") and **zero SQL**, yet still occupied a numeric prefix — producing the duplicates.

The three offending files were:

| Stub (empty, removed) | Bytes | Real file that holds the SQL (kept) |
|---|---|---|
| `016_storage_buckets.sql` | 183 | `017_storage_buckets.sql` |
| `017_seeker_profile_fields.sql` | 177 | `018_seeker_profile_fields.sql` |
| `018_notification_prefs.sql` | 236 | `019_notification_prefs.sql` |

### Resolution — deletion, not renumber (deliberate, documented deviation)

The original mission said "renumber the duplicate filenames." In practice there is **no free number to renumber into**: the real content already lives at the next sequential number, and `022`–`026` are reserved/contested. The duplicates are **empty stubs with no SQL**, so the correct, order-preserving fix is to **delete the three stubs**. This:

- eliminates every duplicate prefix,
- preserves the semantic order of the real migrations (`016` security → `017` storage → `018` seeker → `019` notif → `020` indexes → `021` rls),
- touches only owned paths (`016_*`, `017_*`, `018_*`),
- does **not** alter the Lane A security migration contents, and
- does **not** touch reserved numbers.

### Final old-to-new numbering map

| Old on-disk | New on-disk | Action |
|---|---|---|
| `016_lock_down_security_definer_functions.sql` | `016_lock_down_security_definer_functions.sql` | unchanged (real) |
| `016_storage_buckets.sql` (empty stub) | _removed_ | content already at `017_storage_buckets.sql` |
| `017_storage_buckets.sql` | `017_storage_buckets.sql` | unchanged (real) |
| `017_seeker_profile_fields.sql` (empty stub) | _removed_ | content already at `018_seeker_profile_fields.sql` |
| `018_seeker_profile_fields.sql` | `018_seeker_profile_fields.sql` | unchanged (real) |
| `018_notification_prefs.sql` (empty stub) | _removed_ | content already at `019_notification_prefs.sql` |
| `019_notification_prefs.sql` | `019_notification_prefs.sql` | unchanged (real) |

## 4. Repo-vs-prod drift & reconciliation

### Known drift signals

1. **Doc numbering ≠ on-disk numbering.** The planning docs (`migrations-v1-foundation.md`, etc.) describe an aspirational `001`–`014 + RLS` layout. The on-disk reality diverged (e.g. `013_rls_policies.sql` is RLS, not the doc's planned topic for `013`). Treat the on-disk sequence in §2 + `migration-allocations.json` as authoritative; the `migrations-v1-*` docs are historical planning narrative.
2. **Partial prod application.** `019_notification_prefs.sql` was applied directly to the remote Supabase project (via MCP `apply_migration`, with founder approval) ahead of a normal ordered apply. Any environment that has not replayed `016`–`021` in order may be behind.
3. **Contested `022`.** Three open PRs each define a different `022_*` migration (`022_search_index`, `022_email_log`, `022_listing_expiry`). At most one may keep `022`.

### Reconciliation process (required before the next migration merges)

1. **Confirm prod head.** In the Supabase project, list applied migrations and record the highest applied number and any out-of-order applies (e.g. `019`).
2. **Diff repo vs prod.** Ensure every repo migration `001`–`021` is applied in order in prod; backfill any gap in a controlled window.
3. **Resolve `022`.** Founder assigns `022` to exactly one PR in `migration-allocations.json`; the other two PRs renumber to the next free reserved numbers (`023`/`025`/`026` per their lane) and update the registry in the same change.
4. **Re-run the guard** (`node tools/scripts/check-migration-prefixes.mjs`) — it must pass on the integration branch before merge.
5. **Record the prod apply** of each newly merged migration back here (date + environment).

### Known duplicate *topics* to watch

- `storage_buckets`, `seeker_profile_fields`, `notification_prefs` each previously appeared under two prefixes. The empty stubs are now removed; do not reintroduce them.

## 5. Reserving a new migration number

Numbers are claimed in `tools/scripts/migration-allocations.json` **before** the migration file is added. The guard rejects any migration whose number is absent from the registry, so a lane cannot silently claim a number. Reserved today: `022` (contested), `023`/`025`/`026` (other lanes), **`024` (Lane B / migration-integrity)**.

## 6. Resolution log

### 2026-06-15 — Duplicate prefix resolution (022 / 024 / 031 / 032)

A clean `supabase start` failed with `duplicate key ... schema_migrations_pkey (version)=(022)`
because four files shared prefix `022` and others shared `024` / `031` / `032` (the contested
numbers tracked in §4.3 / §5). Resolved by keeping the dependency-critical file at each contested
number and renumbering the rest to the next free block `033`–`039`:

| Kept at original | Renumbered to |
| --- | --- |
| `022_host_profile_enhancements` (027 needs `tagline`/`host_name`) | `022_email_log` → `033_email_log` |
| `024_application_role_counts` | `022_listing_expiry` → `034_listing_expiry` |
| `031_community_phase2` (032 depends on its tables) | `022_search_index` → `035_search_index` |
| `032_community_phase3` (depends on 031) | `024_gallery_photo_urls` → `036_gallery_photo_urls` |
| | `031_seeker_profile_photo_url` → `037_seeker_profile_photo_url` |
| | `032_resume_builder_fields` → `038_resume_builder_fields` |
| | `032_seeker_dashboard_fields` → `039_seeker_dashboard_fields` |

All seven renumbered migrations are idempotent (`IF NOT EXISTS` / `create or replace` /
`drop ... if exists`), so re-applying them where the old prefixes were already recorded is a safe
no-op. `tools/scripts/migration-allocations.json` updated to match; `check-migration-prefixes`
passes (37 files, 37 unique prefixes). Applied cleanly to the local stack via `supabase start`.
**Remote staging/prod reconciliation still required** before the next migration merge per §4.
