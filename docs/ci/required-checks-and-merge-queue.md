# CI gates, required checks & merge queue

> Control-plane doc. Source of truth for what "runs green" means before code reaches `main`.
> Canon: **Explore&Earn — Build Pipeline (Active)** (the must-run-green rule).

## What CI runs (`.github/workflows/ci.yml`)

Two jobs run on every `pull_request`, on `merge_group` (the merge queue), and on `push` to `main`:

### `verify`
1. `pnpm typecheck` — `tsc -b`
2. `pnpm lint` — eslint
3. `pnpm lint:workflows` — github-actionlint
4. `pnpm guardrails` — `db:assert` + pricing / calendar-sync / match-isolation / category-taxonomy / canon-contracts drift checks
5. **`pnpm build`** — `turbo run build` across `apps/*` + `packages/*` (NEW — the real compile gate)
6. **`pnpm test`** — `pnpm -r --if-present test` (NEW — no-op where tests are absent, grows with coverage)

### `design-guardrails`
- **G30** — single icon system (no lucide / heroicons / react-icons / fontawesome / mui icons outside `packages/ui/src/icons`)
- **G22** — Verified Host badge must carry the "Self-Declared by Host" qualifier

Extras in this workflow: a `concurrency` group cancels superseded runs (agents push fast), and `setup-node` caches the pnpm store.

## Required status checks (set once, in repo Settings)

These are **repo settings**, not committed files. On `main` (Settings → Branches → branch protection):

1. **Require status checks to pass before merging**, and select:
   - `verify`
   - `design-guardrails`
2. **Require a pull request before merging** (no direct pushes to `main`).
3. **Require branches to be up to date** (or rely on the merge queue, below).

> Note: the primary job was renamed from `guardrails` to `verify` (it now also builds + tests). If a required check named `guardrails` was configured previously, remove it and add `verify`.

## Merge queue (set once, in repo Settings)

Enable **Settings → Branches → Require merge queue** on `main`. The queue serializes merges and re-tests each PR against the latest `main` — this is the fix for two agents colliding on the same files. The `merge_group:` trigger in `ci.yml` is what lets CI run on the queued commit; without it the queue cannot gate.

## Follow-ups (intentionally staged)

- **Flip install to `--frozen-lockfile`.** Target state for reproducible CI — it catches `pnpm-lock.yaml` drift instead of hiding it. Staged separately so this PR doesn't fail on day one if the lockfile is stale. Flip after the build gate is proven green.
- **Verify `pnpm build` env.** `apps/web` is Next.js; if the build reads env vars it can fail in CI. Use a build-time `SKIP_ENV_VALIDATION` flag or provide CI dummy env. Confirm with a clean-checkout `pnpm build` locally (the `agent:vscode` local-verify role) before requiring `verify`.
- **Turborepo remote cache** (free via Vercel) to reuse build artifacts across the agents' frequent pushes.
