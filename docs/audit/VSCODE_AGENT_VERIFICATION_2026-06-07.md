# VS Code Agent Verification — 2026-06-07

Scope:
- Baseline audit tree: `ebfb4d3895627dfe17b2edd7ba72fb120e0a5a2d` in detached worktree `/tmp/ee-audit-ebfb4d3`
- Local branch comparison target: `feature/rls-hardening` at `c66f5415a74e1a915e04ddf3bb871f8790af77ed`
- This pass was read-only against code/git/PR metadata. I did not touch the DB.

## Executive Summary

- The repository baseline at `ebfb4d3` supports `S2`, `S3`, `S4`, `M1`, `M2`, and `P3`.
- The repository baseline does **not** support the claimed `S1` root cause. I found **no migration after `016_lock_down_security_definer_functions`** that re-creates those 8 functions or re-grants `PUBLIC`/`anon` execute.
- `feature/rls-hardening` currently has **divergent history but identical tree content** to `origin/main`; it adds no net migration or policy changes beyond baseline.
- Several claims are prod-only and remain unverifiable from local code alone: `M3`, `P4`, and the live-advisor portion of `S1`.

## Baseline Verification Against `ebfb4d3`

### Security

#### S1 — SECURITY DEFINER anon-executable RPCs; later migration re-grants execute
Status: **DISAGREE** on the repo root-cause hypothesis. **CAN'T VERIFY** the live-prod advisor result from local code.

Evidence:
- `016_lock_down_security_definer_functions.sql` explicitly revokes `PUBLIC` execute from the 5 RLS helpers, the 2 trigger functions, and `set_host_attestation`, then re-grants only authenticated/service_role where needed: `supabase/migrations/016_lock_down_security_definer_functions.sql:28-46`.
- The earlier helper lock-down already existed in `013_rls_policies.sql`: `supabase/migrations/013_rls_policies.sql:76-86`.
- Full migration grep on the audited tree found **no** `CREATE OR REPLACE FUNCTION` for any of the 8 named functions after `016_*`, and **no** later `GRANT EXECUTE ... TO PUBLIC/anon`.
- The only post-016 mention of any of the named functions is a policy use-site in `supabase/migrations/021_rls_complete.sql:44`; it does not recreate or re-grant the function.

Conclusion:
- In repo state `ebfb4d3`, I cannot reproduce a later migration that restores anon/public execute. The exact migration that re-grants execute is **not present in this repo baseline**.
- If prod still flags lint `0028/0029`, the likely causes are repo<->prod drift, a manual DB-side grant, or a migration not present in this audited tree.

#### S2 — `profile-photos` and `listing-media` have broad public `SELECT` on `storage.objects`
Status: **AGREE**.

Evidence:
- `supabase/migrations/017_storage_buckets.sql:29-31` documents `listing-media` `SELECT: public`.
- `supabase/migrations/017_storage_buckets.sql:77-80` creates `listing_media_public_read` on `storage.objects` for `anon, authenticated` using only `bucket_id = 'listing-media'`.
- `supabase/migrations/017_storage_buckets.sql:83-86` documents `profile-photos` `SELECT: public`.
- `supabase/migrations/017_storage_buckets.sql:193-196` creates `profile_photos_public_read` on `storage.objects` for `anon, authenticated` using only `bucket_id = 'profile-photos'`.

#### S3 — `events`, `media_assets`, `media_buckets` have RLS enabled but zero policies
Status: **AGREE**.

Evidence:
- `supabase/migrations/015_rls_remaining_tables.sql:47-49` enables RLS on `public.events`, `public.media_buckets`, and `public.media_assets`.
- `supabase/migrations/015_rls_remaining_tables.sql:175` states: `intentionally no policies for: events, media_buckets, media_assets`.
- `supabase/migrations/015_rls_remaining_tables.sql:197-203` records an app scan and says no client writes to `events` and no client/anon reads of `media_buckets` or `media_assets` were found.
- My source grep matched only generated DB types for these tables, not runtime query code.

Client-path assessment:
- I found no direct runtime `.from("events")`, `.from("media_assets")`, or `.from("media_buckets")` query in `apps/` or `packages/`; only generated types reference those names.

#### S4 — app-layer row scoping relies on `.eq("clerk_user_id", sub)` with `authedClient()`
Status: **AGREE**.

Evidence:
- `packages/db/src/client.ts:33-52` shows `authedClient(clerkToken)` creating a Supabase client with the **anon key** and a `Bearer ${clerkToken}` header.
- `packages/db/src/queries/hostProfiles.ts:10-16` documents the security model directly: anon key + Clerk JWT, no row-level enforcement at the PostgREST role boundary, and app-code scoping by verified `clerkUserId`.
- Representative application-layer filters:
  - `packages/db/src/queries/hostProfiles.ts:53-58`
  - `packages/db/src/queries/seekerProfiles.ts:69-77`

Qualification:
- The repo also contains RLS policies on many tables (`013_*`, `015_*`, `021_*`), so the precise statement is: **the app still relies on app-layer `.eq("clerk_user_id", ...)` filters as an active guardrail, even where DB RLS now also exists**.

#### S5 — storage-bucket tightening was applied but broad public-read still exists
Status: **CAN'T TELL** on the named migration; **AGREE** on the incomplete outcome.

Evidence:
- I found **no migration named** `storage_buckets_path_scoped_rls` or any matching string in the audited repo.
- I did verify the incomplete outcome: the broad public-read policies in `017_storage_buckets.sql:77-80` and `017_storage_buckets.sql:193-196` remain present at `ebfb4d3`.

### Migration Integrity

#### M1 — duplicate numeric prefixes in `supabase/migrations/`
Status: **AGREE**.

Evidence from `ls supabase/migrations` at `ebfb4d3`:
- `016_lock_down_security_definer_functions.sql`
- `016_storage_buckets.sql`
- `017_seeker_profile_fields.sql`
- `017_storage_buckets.sql`
- `018_notification_prefs.sql`
- `018_seeker_profile_fields.sql`

#### M2 — open PRs each add a different `022_*.sql`
Status: **AGREE**.

Evidence from `gh pr view --json files`:
- PR `#172` adds `supabase/migrations/022_listing_expiry.sql`
- PR `#173` adds `supabase/migrations/022_email_log.sql`
- PR `#174` adds `supabase/migrations/022_search_index.sql`

Conclusion:
- Those PRs are collision-bound if merged without renumbering or coordination.

#### M3 — prod migration ledger no longer maps 1:1 to repo filenames
Status: **CAN'T TELL**.

Evidence / limitation:
- I do not have the prod migration ledger or direct DB visibility in this pass.
- Repo evidence does show drift risk: duplicate numeric prefixes already exist, and there are semantically duplicated migration topics (`seeker_profile_fields`, `notification_prefs`) under multiple numbers.
- I cannot prove the current prod ledger mismatch from local code alone.

### Process / CI

#### P1 — `ci.yml` is a thin caller; actual CI/gates uncertain
Status: **DISAGREE** with the `unconfirmed` portion.

Evidence:
- Repo caller is thin: `.github/workflows/ci.yml:1-13`.
- It delegates to the org reusable workflow at `/home/jackson/automatedempires/.github/.github/workflows/reusable-ci.yml:1-36`.
- That reusable workflow runs:
  - `pnpm install --frozen-lockfile`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm run --if-present lint:workflows`
  - `pnpm run --if-present guardrails`
  - `pnpm build`
  - `pnpm run --if-present test`
- The same reusable also runs a separate `design-guardrails` job with explicit `G30` and `G22` checks: `/home/jackson/automatedempires/.github/.github/workflows/reusable-ci.yml:27-36` and following.
- In this repo, `package.json` defines `guardrails` as `db:assert` plus `check-pricing`, `check-calendar-sync`, `check-match-isolation`, `check-category-taxonomy`, and `check-canon-contracts`: `package.json:9-22`.
- Branch protection on `main` currently requires only `verify` and `design-guardrails`; it does **not** require approvals: GitHub branch-protection API output on 2026-06-07.

#### P2 — PRs `#170/#172/#174/#115` openly state typecheck/lint/build were not run locally; branch protection unconfirmed
Status: **DISAGREE**.

Evidence:
- PR `#172` body explicitly says CI is the first real verification and local typecheck/lint/build were not run.
- PR `#115` body explicitly says `pnpm lint / typecheck were NOT run` and a lockfile regen is still required.
- PR `#170` body says `typecheck passed` and `lint passed`, while `build / tests` remain unchecked; that is **not** the same as “typecheck/lint/build were NOT run locally.”
- PR `#174` body, as retrieved, does **not** contain a matching admission that local typecheck/lint/build were not run.
- Branch protection is no longer unconfirmed: required checks are `verify` and `design-guardrails`, `required_approving_review_count` is `0`, and conversation resolution is required (GitHub branch-protection API, 2026-06-07).

#### P3 — retired Codex still wired in router/build workflows; `codex-review.yml` still present
Status: **AGREE**.

Evidence:
- `.github/workflows/pr-agent-router.yml:48-49` still accepts `codex` as a routed agent.
- `.github/workflows/pr-agent-router.yml:69-74` still watches `@codex` mentions.
- `.github/workflows/agent-build-task-router.yml:41-43` still lists `agent:codex` as an allowed label.
- `.github/workflows/codex-review.yml:1` exists in baseline.

#### P4 — prod business tables are empty except reference tables
Status: **CAN'T TELL**.

Evidence / limitation:
- This is a prod-data claim. I did not query prod and have no local snapshot of row counts.
- Local repo evidence is insufficient to verify or refute actual prod table cardinality.

## Exact S1 Root Cause Migration

Result: **not found in the audited repo tree or in `feature/rls-hardening`.**

What I checked:
- Every migration for the 8 named functions.
- Every `grant execute` in `supabase/migrations/`.
- Every post-016 `create function` / `create or replace function` occurrence.

What I found:
- No post-016 migration recreates any of those 8 functions.
- No post-016 migration grants execute to `PUBLIC` or `anon` for those functions.
- Therefore I cannot name a repo migration that restores anon/public execute, because none exists in the audited local code.

## `feature/rls-hardening` vs `origin/main`

### Branch state

- Local branch: `feature/rls-hardening`
- HEAD: `c66f5415a74e1a915e04ddf3bb871f8790af77ed`
- Divergence from `origin/main`: `1` behind / `9` ahead (`git rev-list --left-right --count origin/main...feature/rls-hardening`)
- Merge base: `eb6a1c0086e2dc20cd7992868fa63d4709b65683`

### Net content comparison

Result: **no net file-content difference from `origin/main`.**

Evidence:
- `git diff --name-status origin/main..feature/rls-hardening` returned no paths.
- `git diff origin/main..feature/rls-hardening -- supabase/migrations` returned empty.
- Tree SHA matches on both refs:
  - `origin/main^{tree}` = `a492f4cfef2c78d51c2476a87d4a37b443fdd64d`
  - `feature/rls-hardening^{tree}` = `a492f4cfef2c78d51c2476a87d4a37b443fdd64d`

Implications:
- (a) anon-RPC revoke: **no net branch-only change** beyond what is already in `origin/main`.
- (b) storage buckets / public-read policies: **no net branch-only change**.
- (c) `events` / `media_assets` / `media_buckets` policies: **no net branch-only change**.
- (d) new migration files: **none**.

### Push / PR / prod-apply status

- The branch is **not pushed**: `git ls-remote --heads origin feature/rls-hardening` returned nothing.
- I found **no open PR** for `feature/rls-hardening` in `gh pr list --state open`.
- I **cannot verify against prod** whether any equivalent content was applied there, because this pass had no DB ledger access.

## What The Original Audit Missed Or Got Wrong

1. The S1 repo-root-cause hypothesis is not supported by the audited code. There is no later migration in local repo history that recreates the 8 functions or re-grants `PUBLIC`/`anon` execute after `016_lock_down_security_definer_functions`.
2. `feature/rls-hardening` sounds security-specific, but today it is history-only divergence; its tree content is identical to `origin/main`.
3. `013_rls_policies.sql` had already revoked `PUBLIC` execute for the five helper functions before `016`; `016` reinforced that and extended the lock-down to the trigger functions plus `set_host_attestation`.
4. `packages/db/src/queries/hostProfiles.ts:10-16` contains a stale security comment saying RLS is not yet enabled on `host_profiles`, but `013_rls_policies.sql:91-100` does enable RLS on `host_profiles`. The code still manually scopes by `clerk_user_id`, but the comment overstates the current DB state.

## Follow-up Recommendation Before Any Fix PRs

- Treat S1 as a **repo/prod drift investigation**, not yet a migration-authoring problem.
- Before shipping a new fix migration, compare the live DB grants and `supabase_migrations.schema_migrations` ledger against repo `ebfb4d3`/`main`; otherwise a new migration could paper over an unknown source of drift.