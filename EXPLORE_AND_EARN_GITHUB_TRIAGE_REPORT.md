# Explore&Earn — GitHub Triage Report

> Generated: 2026-06-05 | Agent: Claude Code (Sonnet 4.6)

---

## Open PRs

| # | Title | Author | Draft | Mergeable | CI | CodeRabbit | Classification |
|---|-------|--------|-------|-----------|-----|-----------|----------------|
| 103 | Fix route shell ownership and add smoke coverage | Jackson | No | **CONFLICTING** | None | ✅ SUCCESS | Needs rebase |
| 102 | feat(auth+maps): migrate Supabase Auth → Clerk, lock Mapbox | Copilot SWE | **DRAFT** | MERGEABLE | None | — | Needs founder auth-gate decision |
| 72 | Enforce `category.*` icon-key drift guardrail | Copilot SWE | **DRAFT** | MERGEABLE | None | — | Verify if superseded by main |

---

### PR #103 — Fix route shell ownership and add smoke coverage

- **Branch:** `fix/shell-ownership-smoke` — 2 ahead, **12 behind** origin/main → CONFLICTING
- **Key changes:** Root layout AppShell removed; 5 Playwright smoke tests added (/, /search, /listing/[id], /swipe, /host)
- **CodeRabbit:** ✅ Already ran successfully
- **CI:** Did not run (conflicting branch)
- **Next action:** Jackson rebases `fix/shell-ownership-smoke` onto current `origin/main`, then: `@copilot review this PR for regressions in shell ownership and route chrome`

---

### PR #102 — feat(auth+maps): migrate Supabase Auth → Clerk, lock Mapbox

- **Branch:** `copilot/migrate-auth-and-maps` — DRAFT, MERGEABLE
- **Context:** Implements Issue #91. Notion D013 (2026-06-04) locks Clerk + Mapbox as cross-app standard.
- **Concern:** PR includes compiled `.js`/`.d.ts` files under `packages/*/src/` — these look like dist artifacts and should not be committed to source. Review before merge.
- **Gate:** `auth` — permanent founder gate. Requires explicit founder approval.
- **Next action:**
  1. Jackson reviews compiled-artifact concern
  2. Founder approves auth gate (record decision in Notion first)
  3. Promote from draft
  4. `@copilot review this PR for auth migration correctness, middleware wiring, and whether compiled artifacts belong in source`
  5. `/agent claude review copy, docs, and product-language drift`

---

### PR #72 — Enforce `category.*` icon-key drift guardrail

- **Branch:** `copilot/reconcile-lodge-seasonal-environment` — DRAFT, MERGEABLE
- **Context:** Adds `tools/scripts/check-category-taxonomy.mjs` to hard-fail CI on `category.*` drift
- **Concern:** `category-taxonomy: locked lane set OK` already passes in guardrails on main — the script may already be present on main
- **Next action:** Run `git log --oneline --all -- tools/scripts/check-category-taxonomy.mjs` to check. If already on main, close with explanation. If not, promote, run CI, review, merge.

---

## Open Issues

| # | Title | Labels | Linked PR | Classification | Priority |
|---|-------|--------|-----------|----------------|----------|
| 91 | Adopt cross-app standard: migrate auth → Clerk, maps → Mapbox | — | #102 | Needs founder auth-gate decision | **HIGH** |
| 86 | Foundation unblock: finalize contracts + Modal primitive | — | None | Foundation — blocked behind #58 | **HIGH** |
| 67 | 🟠 Ownership gap: orphaned surfaces & stale shell branch | — | #103 (partial) | Active — partially addressed by PR #103 | **HIGH** |
| 58 | Contracts V1 — expand packages/contracts | area:contracts, risk:low, ready-for-engineering | None | **READY TO PICK UP** | **HIGH** |
| 48 | Payments V1 — implement from build pack | — | None | Founder-gated / backlog | LOW (gated) |
| 47 | Backend Database & API V1 — implement from build pack | — | None | Founder-gated / backlog | LOW (gated) |
| 46 | Matching V1 — implement from build pack | — | None | Founder-gated / backlog | LOW (gated) |
| 28 | Notion → GitHub Issue Dispatcher worker (audit) | — | None | Governance / tooling | MEDIUM |
| 11 | [Epic] Frontend V1 — app shell → surfaces (tracking) | — | None | Tracking epic — keep open | — |
| 6 | Reconcile lodge as Seasonal environment, not category | — | #72 (draft) | Resolved in code; guardrail pending | LOW |
| 2 | Sprint Zero — Finish & govern substrate foundation | — | None | Mostly done — candidate to close | LOW |

---

## Issue #58 — Next Foundational PR (READY)

This is the highest-value unblocked work item. Labeled `ready-for-engineering`, `area:contracts`, `risk:low`, `canon:cited`. No agent has claimed it. It expands `packages/contracts` with canonical registries needed before any persistence layer. This unblocks Issue #86 and is the prerequisite for Supabase schema V1 (#47).

---

## CI Workflows

| Workflow | State | Notes |
|----------|-------|-------|
| CI | Active | **Bug:** `ci-$ github.ref` → should be `ci-${{ github.ref }}` |
| Release | Active | Tag-triggered |
| Copilot | Active | GitHub-native review |
| Copilot cloud agent | Active | Cloud coding agent |
| Agent Build Task Router | Active | Issues → labels routing |

---

## AI Review Table

| PR | Copilot | Codex | Claude | CodeRabbit | Recommended action |
|----|---------|-------|--------|------------|-------------------|
| 103 | Not yet | Not yet | Not yet | ✅ | Rebase → `@copilot review` → merge |
| 102 | Not yet | Not yet | Not yet | — | Resolve artifact concern → promote from draft → request review |
| 72 | Not yet | Not yet | Not yet | — | Check if superseded; if not, promote → review → merge |
