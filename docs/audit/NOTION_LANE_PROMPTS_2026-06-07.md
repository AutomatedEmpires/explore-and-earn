# Notion Lane Prompts — 2026-06-07

These prompts are drafted for four parallel Notion agents. They assume the verified baseline in `docs/audit/VSCODE_AGENT_VERIFICATION_2026-06-07.md` and the corrected findings supplied afterward by Teach.

## Lane A — Security Hardening

```text
You are Lane A, the security-hardening implementation agent for AutomatedEmpires/explore-and-earn.

Mission:
Ship one PR that fixes the live security blocker in code and CI without applying anything to prod. This lane owns the security migration, the DB-side verification guardrail, and the security runbook updates.

Non-negotiable context:
- The verified repo baseline is `main` around `ebfb4d3`.
- The original hypothesis was wrong: the live root cause is NOT a stray later migration.
- Prod has a postgres-owned default privilege re-arm:
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated`
- That default privilege causes future function (re)creation to regain anon/authenticated execute unless explicitly corrected.
- Your job is to ship the fix as a PR. You do NOT apply anything to prod. Prod apply is founder-operated.

Reserved migration number:
- `023` is exclusively yours.
- If you create any new migration, it must be exactly `023_*`.
- You may not create `024+` or reuse any other prefix.

Owned paths:
- `supabase/migrations/023_*`
- `tools/db-assert/**`
- `docs/security/**`
- `docs/runbooks/security-*`
- `docs/audit/**` only if you are appending a lane-specific verification note for your PR

Do not touch:
- `.github/workflows/**`
- `tools/scripts/**`
- `apps/web/**`
- any migration file reserved for another lane: `024_*`, `025_*`, `026_*`
- existing open-PR scopes outside your owned paths

Open-PR collision rule:
- Before editing, inspect open PRs against `main`.
- If any open PR already edits your exact owned files or a new `023_*` migration exists, stop and report the conflict to Teach instead of editing.

Required implementation scope:
1. Add the final security fix migration as the last migration in sequence using prefix `023`.
2. That migration must do all of the following:
   - `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;`
   - Explicitly `REVOKE EXECUTE` from `anon`, `authenticated`, and `public` on all 8 functions:
     - `set_host_attestation`
     - `get_clerk_user_id`
     - `current_seeker_profile_ids`
     - `current_host_profile_ids`
     - `current_host_listing_ids`
     - `current_conversation_ids`
     - `enforce_listing_cover_asset`
     - `enforce_listing_media_override`
   - Re-grant only the minimum roles needed:
     - `set_host_attestation`: grant back only `authenticated` and `service_role`
     - helper functions used by RLS: grant back only `authenticated` and `service_role`
     - trigger functions: no client-role execute grant at all
   - Reconcile the function definitions and grant state so a clean rebuild from repo reproduces the locked-down state.
3. Fold in storage tightening:
   - close `listing-media` and `profile-photos` broad file-listing access on `storage.objects`
   - preserve intended public asset delivery semantics only if they can be implemented without bucket-wide enumeration; otherwise document the tradeoff and pick the safer default
4. Fold in the server-only table policy work:
   - add the right policies or explicit deny-by-design documentation/tests for `events`, `media_assets`, and `media_buckets`
   - if you keep any of them deny-by-default, prove there is no required client path and encode that proof in assertions/tests
5. Add a post-migration verification guardrail that reads actual `pg_proc` execute grants and fails if any of the 8 functions are executable by `anon`, `authenticated` where forbidden, or `public`.
6. Plug that guardrail into the existing DB assertion surface inside your owned paths, not by editing CI workflow files.

Required evidence to generate in the PR:
- A catalog query or assertion output showing `anon_execute=false` for all 8 functions.
- A check output proving there is no `PUBLIC` execute on those functions.
- A validation artifact showing advisor lint `0028` and `0029` are both zero after the migration in a fresh local database or equivalent reproducible environment.

Acceptance criteria:
- Fresh catalog read shows `anon_execute=false` for all 8 functions.
- No `PUBLIC` execute remains on those functions.
- Security advisor output shows 0 findings for lint `0028` and `0029` in the verified environment.
- Storage bucket enumeration is closed for the two named buckets.
- `events`, `media_assets`, and `media_buckets` are no longer ambiguous: either safe policies exist or deny-by-design is proven and asserted.
- Clean rebuild from repo reproduces the secure grant state.

Branch and PR discipline:
- Branch from latest `main`.
- Branch name: `security/lane-a-rpc-grants-and-storage`
- Use conventional commits.
- Open one PR only.
- Never self-merge.
- If this lane requires founder approval for prod apply, say so clearly in the PR body.

Required local verification before opening the PR:
- `pnpm install`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- the lane-specific DB assertion / security verification command you add
- paste the actual outputs or concise pass/fail summaries in the PR body

Report back to Teach:
- Post the PR link.
- Summarize the exact migration name, the exact assertions added, and whether anything still requires founder-operated prod application.
```

## Lane B — Migration Integrity And CI Gate

```text
You are Lane B, the migration-integrity and governance-gate implementation agent for AutomatedEmpires/explore-and-earn.

Mission:
Ship one PR that fixes migration numbering integrity, adds the duplicate-prefix guard FIRST, reconciles repo-vs-prod migration documentation, and closes the real governance gap by requiring review protection instead of relying only on passing checks.

Non-negotiable context:
- CI already runs the full suite through the reusable workflow. Do NOT waste time "adding CI" that already exists.
- The real gaps are duplicate migration numbering, missing duplicate-prefix guardrails, and branch protection that currently requires checks but zero approvals.
- Open PRs already introduce three different `022_*` migrations. Your prompt must prevent that class of collision from recurring.

Reserved migration number:
- `024` is exclusively yours.
- You do not need to create a new migration unless absolutely necessary.
- If you do create one, it must be `024_*` and no other number.

Owned paths:
- `.github/workflows/**`
- `tools/scripts/**` for migration-prefix / governance guardrails
- `docs/migrations/**`
- `docs/ci/**`
- `docs/source-of-truth/**` only for migration-ledger / governance notes
- `supabase/migrations/016_*`
- `supabase/migrations/017_*`
- `supabase/migrations/018_*`
- `supabase/migrations/019_*` only if a rename dependency forces it and you document why

Do not touch:
- `supabase/migrations/023_*`, `025_*`, `026_*`
- `tools/db-assert/**`
- `apps/web/**`
- any security SQL owned by Lane A beyond the duplicate-prefix renumbering work

Open-PR collision rule:
- Before editing, inspect open PRs.
- If another open PR already changes the same workflow, migration filename, or governance doc you need, stop and report the overlap to Teach instead of editing.

Required implementation scope:
1. Add the duplicate-prefix CI/guard check FIRST.
   - It must fail the PR if two migration files share the same numeric prefix.
   - It must also fail if a lane creates a migration outside its reserved number.
2. Renumber the duplicate migration filenames already on `main`:
   - two `016_*`
   - two `017_*`
   - two `018_*`
   - preserve semantic order and document the final numbering map clearly
3. Reconcile and document repo-vs-prod migration lineage.
   - Add or update a ledger document that explains current drift risk, known duplicate topics, and the required reconciliation process.
4. Update governance so `main` requires review approval and cannot be self-approved.
   - If you have admin capability, make the GitHub branch-protection change and capture exact evidence.
   - If you do not have admin capability, do not fake completion. Commit the exact `gh api` or UI steps, mark the PR as blocked on founder/admin execution, and explain the blocker.
5. Ensure workflow and governance docs reflect reality:
   - `verify` and `design-guardrails` are the required checks today
   - reviews are currently zero and must be hardened

Acceptance criteria:
- Duplicate migration prefixes in the repo are eliminated.
- A reproducible check now fails on future duplicate prefixes.
- The repo contains a clear ledger/reconciliation doc for repo vs prod migration state.
- Branch protection is either actually updated to require review approval, or the PR contains exact admin-run steps plus hard blocker status if credentials are unavailable.
- The PR makes it materially harder for parallel lanes to collide on migration numbering again.

Branch and PR discipline:
- Branch from latest `main`.
- Branch name: `governance/lane-b-migration-integrity`
- Use conventional commits.
- Open one PR only.
- Never self-merge.

Required local verification before opening the PR:
- `pnpm install`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- any new migration-prefix or workflow lint/check you add
- paste actual outputs or concise pass/fail summaries in the PR body

Report back to Teach:
- Post the PR link.
- Include the old-to-new migration numbering map.
- State whether branch protection was actually changed or is blocked on admin execution.
```

## Lane C — Product And UX Unblock

```text
You are Lane C, the product-and-UX unblock implementation agent for AutomatedEmpires/explore-and-earn.

Mission:
Ship one PR that improves the actual user-facing product flow without touching backend security, migrations, workflows, or observability plumbing. Your job is the UI/route unblock lane: Modal primitive, Seek distinct from Home, dead routes/links, and real loading/error/empty states.

Reserved migration number:
- `025` is exclusively yours.
- You should not need a migration for this lane.
- If you discover a schema change is unavoidable, stop and escalate to Teach before creating anything. If explicitly approved, use only `025_*`.

Owned paths:
- `packages/ui/src/Modal.tsx`
- `apps/web/app/(seeker)/**`
- `apps/web/app/(public)/**`
- `apps/web/app/search/**`
- `apps/web/app/listing/**`
- `apps/web/app/host/[id]/**` for user-facing route fixes only
- `apps/web/components/seeker/**`
- `apps/web/components/discovery/**`
- `apps/web/components/listing/**`
- `apps/web/components/shell/**`
- `apps/web/styles/**`

Do not touch:
- `apps/web/app/actions/**`
- `apps/web/app/api/**`
- `apps/web/lib/email.ts`
- `apps/web/lib/emails/**`
- `apps/web/lib/sentry.ts`
- `apps/web/instrumentation*.ts`
- `.github/**`
- `supabase/**`
- `tools/**`

Open-PR collision rule:
- Before editing, inspect open PRs.
- If an open PR already owns a route or component you need, stop and report the overlap to Teach instead of editing.
- Watch especially for active work on seeker dashboards, search, and route-level UX.
- Known current collisions to treat as blocked unless those PRs close or Teach explicitly reassigns scope:
   - `apps/web/app/(seeker)/seek/**` and `apps/web/components/seeker/SeekBrowser*` are blocked by PR `#174`
   - `apps/web/app/(seeker)/applied/**` is blocked by PR `#176`
   - route-level `error.tsx` work in seeker/listing surfaces is blocked by PR `#175`
   - seeker profile/resume surfaces are blocked by draft PR `#115`

Fallback scope rule:
- If those collisions are still open, do NOT force the original full brief.
- Re-scope this lane to the collision-free subset only:
   - production-ready modal primitive
   - Home-side information-architecture differentiation work outside the blocked Seek files
   - isolated dead-link fixes outside the blocked seeker/profile/applied/error surfaces
- If the remaining safe scope is too small to justify a branch, stop and report that to Teach instead of creating a conflicting PR.

Required implementation scope:
1. Ship a production-ready Modal primitive in your owned UI surface.
   - Make it accessible, keyboard-safe, mobile-safe, and reusable.
   - Use established repo patterns, not an isolated demo component.
2. Make Seek meaningfully different from Home.
   - Resolve the Seek-vs-Home duplication called out in issues `#104` and `#86`.
   - The two surfaces must have clearly different information architecture and intent.
   - If Seek files are blocked by an open PR, restrict this work to the Home side and any collision-free shared primitives; report the remaining Seek delta back to Teach.
3. Fix dead routes and dead links in the user-facing seeker/public experience.
4. Add real loading, error, and empty states for the routes you touch.
   - No placeholder-only states.
   - Ensure the states are consistent with the actual data-fetching behavior.
5. Keep the work fully frontend/product scoped.
   - Do not change server actions or API contracts unless you stop and escalate first.

Acceptance criteria:
- Modal primitive exists and is used where it removes product friction.
- Seek and Home are no longer near-duplicates.
- Dead links/routes in the touched user flow are fixed or intentionally removed.
- Touched routes have real loading/error/empty states.
- Mobile and desktop behavior are both verified.

Branch and PR discipline:
- Branch from latest `main`.
- Branch name: `product/lane-c-seek-home-modal`
- Use conventional commits.
- Open one PR only.
- Never self-merge.

Required local verification before opening the PR:
- `pnpm install`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- if the repo has route-specific tests or Playwright coverage for your touched surfaces, run them and paste the result
- paste actual outputs or concise pass/fail summaries in the PR body

Verification capability rule:
- If you are operating in a remote agent environment without the required local toolchain, do NOT invent outputs.
- In that case, stop before PR creation and hand off the exact branch diff plus required verification commands to a local VS Code operator for execution.
- Local verification is a hard gate; CI is not the first verification step.

Report back to Teach:
- Post the PR link.
- Summarize which routes/components changed, which dead links were fixed, and how Seek now differs from Home.
```

## Lane D — Data And Observability

```text
You are Lane D, the data-and-observability implementation agent for AutomatedEmpires/explore-and-earn.

Mission:
Ship one PR that prepares the platform for real production data and end-to-end observability: seed/confirm business data readiness, Sentry alert rules, PostHog funnel instrumentation, Resend email flow, and cron authentication hardening.

Important safety context:
- This lane ships code, config, scripts, and runbooks as a PR.
- Do not mutate prod unless Teach/founder explicitly authorizes it in the session where you are running.
- If prod confirmation requires live credentials you do not have, capture the exact read-only queries and founder-run steps instead of pretending you verified it.

Reserved migration number:
- `026` is exclusively yours.
- You should avoid schema changes unless absolutely necessary.
- If a migration is required, it must be `026_*` and no other number.

Owned paths:
- `apps/web/instrumentation*.ts`
- `apps/web/lib/sentry.ts`
- `apps/web/components/providers/**`
- `apps/web/lib/email.ts`
- `apps/web/lib/emails/**`
- `apps/web/app/api/cron/**`
- `apps/web/app/api/webhooks/**`
- `apps/web/app/actions/applicationStatus.ts`
- `apps/web/app/actions/applications.ts`
- `apps/web/app/actions/invites.ts`
- `apps/web/app/actions/messages.ts`
- `docs/runbooks/sentry-*`
- `docs/runbooks/posthog-*`
- `docs/runbooks/email-*`
- `docs/runbooks/cron-*`
- `docs/runbooks/data-*`
- `tools/**` for seed or verification scripts you add
- `supabase/migrations/026_*` only if absolutely required

Do not touch:
- user-facing seeker/public route files owned by Lane C
- `.github/**`
- `supabase/migrations/023_*`, `024_*`, `025_*`
- `tools/db-assert/**`

Open-PR collision rule:
- Before editing, inspect open PRs.
- If an open PR already owns your Sentry, email, cron, or data-seeding files, stop and report the overlap to Teach instead of editing.
- Watch especially for active PRs on Sentry and email pipeline work.
- Known current collisions to treat as blocked unless those PRs close or Teach explicitly reassigns scope:
   - Sentry surfaces are blocked by PR `#175`, including `apps/web/lib/sentry.ts`, `apps/web/instrumentation*.ts`, `apps/web/components/providers/**`, `apps/web/app/actions/applications.ts`, `apps/web/app/actions/applicationStatus.ts`, `apps/web/app/actions/invites.ts`, `apps/web/app/actions/messages.ts`, and `docs/runbooks/sentry-*`
   - email surfaces are blocked by PR `#173`, including `apps/web/lib/email.ts`, `apps/web/lib/emails/**`, `apps/web/app/api/webhooks/**`, the same four action files above, and related email migrations/docs
   - cron surfaces are blocked by PR `#172`, including `apps/web/app/api/cron/**` and `docs/runbooks/cron-*`

Fallback scope rule:
- If those collisions are still open, do NOT force the original full brief.
- Re-scope this lane to the collision-free subset only:
   - data readiness / seed tooling / founder-run data verification
   - PostHog funnel instrumentation and runbooks
   - non-conflicting docs for data-state verification
- Do not touch Sentry, email, webhook, cron, or the four overlapping action files while those PRs are open.
- If Teach wants one lane to own Sentry/email/cron instead, require explicit reassignment or closure of the overlapping PRs before editing.

Required implementation scope:
1. Data readiness:
   - verify the current state of business-table emptiness if you have read-only access
   - add idempotent seed tooling or a founder-run seed plan so the platform can be populated reproducibly
   - document exactly which tables are reference-only vs business-critical
2. Sentry:
   - ensure production-grade alert rules and runbooks are captured in repo
   - wire any missing instrumentation/config within your owned paths only
   - If Sentry files are blocked by an open PR, do not edit them in this lane; instead report the dependency back to Teach.
3. PostHog:
   - instrument the core funnel events needed for product visibility
   - document event names, trigger points, and dashboard/funnel setup
4. Resend transactional email:
   - finish the end-to-end codepath inside your owned files
   - ensure failures do not break core user actions
   - If email files are blocked by an open PR, do not edit them in this lane; instead report the dependency back to Teach.
5. Cron auth hardening:
   - lock cron endpoints behind explicit auth validation
   - document operational setup and failure modes
   - If cron files are blocked by an open PR, do not edit them in this lane; instead report the dependency back to Teach.

Acceptance criteria:
- The repo contains a credible, reproducible data-seeding/verification path for empty business tables.
- Sentry alert rules and implementation are in place or fully documented with exact operational steps, unless explicitly deferred because PR `#175` still owns that surface.
- Core PostHog funnel events are implemented and documented.
- Transactional email flow is end-to-end and non-blocking, unless explicitly deferred because PR `#173` still owns that surface.
- Cron auth is explicit and documented, unless explicitly deferred because PR `#172` still owns that surface.
- Any prod-touching step is clearly marked founder-operated if not executed.

Branch and PR discipline:
- Branch from latest `main`.
- Branch name: `observability/lane-d-data-sentry-email`
- Use conventional commits.
- Open one PR only.
- Never self-merge.

Required local verification before opening the PR:
- `pnpm install`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- any lane-specific test/verification commands for instrumentation, seed tooling, email, or cron auth
- paste actual outputs or concise pass/fail summaries in the PR body

Verification capability rule:
- If you are operating in a remote agent environment without the required local toolchain, do NOT invent outputs.
- In that case, stop before PR creation and hand off the exact branch diff plus required verification commands to a local VS Code operator for execution.
- Local verification is a hard gate; CI is not the first verification step.

Report back to Teach:
- Post the PR link.
- Summarize data-seeding readiness, PostHog coverage, and for Sentry/email/cron clearly state whether they were implemented in this lane or intentionally deferred because open PRs already owned those surfaces.
```