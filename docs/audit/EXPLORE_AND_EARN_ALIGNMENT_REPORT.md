# Explore&Earn — Alignment Report

> Generated: 2026-06-05 | Branch: `fix/shell-ownership-smoke` | Agent: Claude Code (Sonnet 4.6)

---

## 1. Local Repo State

| Item | Status |
|------|--------|
| Branch | `fix/shell-ownership-smoke` |
| Tracking | `origin/fix/shell-ownership-smoke` |
| Dirty / clean | **Clean** — no unstaged or uncommitted changes |
| Ahead of `origin/main` | **2 commits** (preserve shell/PR-agent work + smoke coverage) |
| Behind `origin/main` | **12 commits** — **must be rebased before merge** |
| Safe to modify | Yes for docs/reports — no code changes until after rebase |

The local branch is CONFLICTING with main. PR #103 is open against this branch and shows `mergeable: CONFLICTING` on GitHub.

---

## 2. MCP / Tooling Status

| Tool | Status |
|------|--------|
| Node | 24.16.0 ✅ |
| pnpm | 10.12.4 ✅ |
| GitHub CLI | Authenticated as AutomatedEmpires ✅ |
| Claude Code | 2.1.162 ✅ |
| claude.ai Notion MCP | ✅ Connected |
| claude.ai Figma MCP | ✅ Connected |
| claude.ai Stripe MCP | ✅ Connected |
| claude.ai Cloudinary MCP | ✅ Connected |
| plugin:github | ✗ Failed to connect |
| plugin:supabase | Needs authentication |
| Playwright | ✅ Connected |

---

## 3. Notion Sources Found

| Page | Last Modified | Relevance |
|------|--------------|-----------|
| Explore&Earn Source of Truth — Master Index | 2026-06-04 | Hub for all product canon — current |
| Explore&Earn — Status & Reset (Jun 2, 2026) | 2026-06-03 | Prior status snapshot — partially stale |
| Explore&Earn — World-Class Status Report (2026-06-04) | 2026-06-04 | Most recent status report — current |
| Explore&Earn — Build Pipeline (Active) | 2026-06-04 | Active execution state — current |
| Explore&Earn — GitHub (database) | 2026-06-03 | GitHub mirror — current |
| Canonical Card System Specification | 2026-05-28 | Discovery Card product truth — locked |
| Icon & Element System — Streamline Freehand (Locked) | 2026-05-31 | Icon system — locked |
| Icon & Illustration Manifest — V1 | 2026-05-31 | First 72–77 icon list — current |
| 3. Discovery Card V1 Build Pack | 2026-05-31 | Ready for engineering |
| Decision Log | 2026-06-04 | Architecture decisions — current |
| Cross-App Alignment Audit — E&E · Sweepza · BidSpace | 2026-06-04 | Cross-venture alignment — current |

### Source-of-Truth Hierarchy (per AGENTS.md §9)

```
1. Notion        → product truth / strategic memory / decisions
2. GitHub issues → accepted implementation scope
3. Repo docs     → build-time mirrors of Notion canon
4. Code          → what is currently implemented
```

**If sources conflict: Notion wins for product truth. Repo wins for current code state.**

---

## 4. Critical Conflicts Found

### CONFLICT 1 — Auth Provider (HIGH: requires founder action)

| Source | Says |
|--------|------|
| `docs/architecture/stack-and-providers.md` | Auth: Supabase Auth — Locked direction |
| Notion Decision Log D013 (2026-06-04) | **Auth = Clerk (cross-app standard). LOCKED** |
| PR #102 | Implements Clerk migration (DRAFT) |

**Notion wins.** The repo doc is stale. `stack-and-providers.md` must be updated when PR #102 merges. Requires founder auth-gate approval first.

### CONFLICT 2 — Maps Provider (HIGH: requires founder action)

| Source | Says |
|--------|------|
| `docs/architecture/stack-and-providers.md` | Maps / geo: Azure Maps — Locked |
| `.env.example` | AZURE_MAPS_KEY= |
| Notion Decision Log D013 (2026-06-04) | **Mapbox locked as maps provider (cross-app standard)** |

**Notion wins.** Both `stack-and-providers.md` and `.env.example` are stale. Update when PR #102 merges.

### CONFLICT 3 — CI Concurrency Expression (LOW: safe to fix)

`ci-$ github.ref` in `.github/workflows/ci.yml` is missing template braces. Should be `ci-${{ github.ref }}`. All CI runs currently share one concurrency key causing unexpected cancellations.

---

## 5. AI Review Flow Status

| Agent | Config | Status |
|-------|--------|--------|
| Copilot | No dedicated `copilot-instructions.md` file; PR template has `@copilot review` command | Active (GitHub-native) |
| Codex | AGENTS.md ✅; `/agent codex` in PR template | Webhook URL unknown — needs CODEX_AGENT_WEBHOOK_URL secret |
| Claude | CLAUDE.md ✅; `/agent claude` in PR template | Webhook URL unknown — needs CLAUDE_AGENT_WEBHOOK_URL secret |
| CodeRabbit | Auto-configured | ✅ Active — ran on PR #103 |

**Missing:** `.github/copilot-instructions.md` for workspace-level Copilot guidance.

---

## 6. What Is Aligned

- ✅ typecheck, lint, guardrails (all 6), build — all pass on current branch
- ✅ AGENTS.md, CLAUDE.md, PR template, issue templates — well-formed
- ✅ Design system tokens — locked and implemented
- ✅ Icon system — Streamline Freehand registry exists, no paid assets committed
- ✅ Shell ownership — fixed in PR #103 (seeker/host own their navs; root layout is clean)
- ✅ Canonical enum registry — mirrors Notion
- ✅ Data-access seam pattern — `data.ts` files in discovery + seeker namespaces

---

## 7. What Needs Owner Decision

| Decision | Gate | Status |
|----------|------|--------|
| Merge PR #102 (Clerk + Mapbox migration) | `auth` founder gate | **Needs founder approval** |
| PR #103 — rebase onto main and merge | Process | Jackson to decide |
| PR #72 — close as superseded or land guardrail | Process | Jackson to decide |
| Extended Vector License for Streamline (>100 icons) | `asset-license` gate | Deferred — count icons first |
| Archive old `exploreandearnv2` repo | Process | Waiting (A-ARCHIVE-V2) |
