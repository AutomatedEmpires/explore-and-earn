# Agent Roster & Routing

This is the directory of actors in the CLAOS Lite relay and the rules for who picks up what,
who reviews, and who is allowed to merge. The relay routes by **label**, but a label is
meaningless without a shared definition of each agent's job. This file is that definition.

> One `agent:*` label = the current owner. Routing = swapping that label per the rules below.
> Status transitions and stall handling live in [`relay-state-machine.md`](./relay-state-machine.md).

## Roster & capabilities

| Agent | Label | Primary role | Can do | Must NOT do |
| --- | --- | --- | --- | --- |
| Opus (Notion) | `agent:opus` | Notion architect / PR author / orchestrator / reviewer | Write specs & Build Packs, author/open PRs, file build tasks, review PRs, reconcile canon, route the baton | Merge gated work without founder; write `.github/workflows/*` (lacks scope); run code locally |
| VS Code (local) | `agent:vscode` | **Local laptop / WSL verifier** on Jackson's machine | `gh pr checkout`, run `pnpm install / lint / typecheck / guardrails / build / test` in WSL, implement on branches, apply `.github/workflows/*`, seed labels | Be conflated with the cloud bot; approve own gated work; merge without review |
| GitHub Copilot (cloud) | `agent:copilot-cloud` | GitHub-hosted Copilot **cloud reviewer/coding agent** | Be started by an `@copilot` mention **or** automatic Copilot PR review; review, comment, and patch PR branches; push commits and iterate PRs from GitHub's servers | Verify Jackson's local WSL env; stand in for `status:verified-local`; replace local verification; merge gated work |
| Codex | `agent:codex` | Implementer / reviewer | Implement, review, propose diffs | Merge gated work; bypass verification |
| Cursor | `agent:cursor` | Implementer / reviewer | Implement, review, refactor | Merge gated work; bypass verification |
| Claude | `agent:claude` | Implementer / reviewer | Implement, review, write docs | Merge gated work; bypass verification |
| Review | `agent:review` | Review-queue marker | Signals "a reviewer must act" | n/a (state marker, not a person) |
| Founder | `agent:founder` | Human decision-maker | Open/close gates, set taste & business direction, authorize merges past gates | Hand-carry status between agents (the relay does that now) |

## Two Copilots — never conflate them

"Copilot" is **two different actors** with different powers. Routing breaks if they are treated as one. The GitHub **trigger text** is `@copilot`; the **durable internal label** is always `agent:copilot-cloud`.

| | `agent:vscode` | `agent:copilot-cloud` |
| --- | --- | --- |
| What it is | VS Code / Copilot running **locally** in Jackson's WSL — the local laptop verifier | GitHub-hosted Copilot **cloud** reviewer/coding agent |
| Where it runs | Jackson's laptop (WSL) | GitHub's servers |
| How it starts | A human drives it in the editor; carries the `agent:vscode` label / verification issue form | An `@copilot` mention in a PR/issue comment **or** automatic Copilot PR review |
| What it does | `gh pr checkout` + `pnpm install / lint / typecheck / guardrails / build / test` | Reviews, comments, and may patch the PR branch from the cloud |
| Can it verify local WSL? | **Yes — that is its entire job** | **No — it cannot see or run Jackson's laptop/WSL** |
| Verification status it can set | `status:verified-local` | only `status:cloud-reviewed` (advisory) — **never** `status:verified-local` |
| Typical output | Local typecheck/lint/build/test results + pushed fixes | Cloud commits + PR review comments/edits |

### Trigger rules

- **`@copilot` in a PR/issue comment** (or **automatic Copilot PR review**) may start or route work to the **GitHub cloud Copilot agent** (`agent:copilot-cloud`). Mention it only when you actually want cloud work — stray `@copilot` mentions can auto-start it. Whatever the trigger text, label the work `agent:copilot-cloud`.
- **`agent:vscode`** means **local WSL verification** by VS Code/Copilot on Jackson's laptop. It is an environment/role (the local laptop verifier), not the cloud bot.
- **The cloud Copilot agent cannot be assumed to have verified Jackson's local WSL environment.** A green cloud run/review is **not** local verification, and `status:cloud-reviewed` does **not** equal `status:verified-local`.
- **Local verification still requires `gh pr checkout` + `pnpm` checks on the laptop** (`pnpm install && pnpm typecheck && pnpm lint`, plus guardrails/build/test as applicable). Only after that may an artifact carry `status:verified-local`.

## Capability boundaries (hard rules)

- **Workflow files (`.github/workflows/*`):** only an actor with the GitHub `workflows` scope can write these. Opus's integration cannot; route such writes to `agent:vscode` or a human. See [`github-artifacts-to-apply.md`](./github-artifacts-to-apply.md).
- **Local-verification authority:** only `agent:vscode` (WSL on Jackson's laptop) can produce `status:verified-local`. `agent:copilot-cloud` runs in the cloud and **cannot** verify the local environment; its output (`status:cloud-reviewed`) is advisory and never satisfies a local-verification gate.
- **Label creation:** seeded once via `gh` ([`github-artifacts-to-apply.md`](./github-artifacts-to-apply.md) §4). Any agent may *apply* existing labels; introducing a new label type is a governance change (route to `agent:opus` + `area:agent-governance`).
- **Canon:** product truth lives in Notion. Code may not silently diverge; divergence becomes `blocked:drift` (see [`relay-state-machine.md`](./relay-state-machine.md)).

## Issue templates (relay inboxes)

| Template | File | Use it to | Auto-labels |
| --- | --- | --- | --- |
| Agent Build Task | `.github/ISSUE_TEMPLATE/agent-build-task.yml` | Opus dispatches spec-complete implementation work to a worker | `status:ready` |
| Agent Verification Task | `.github/ISSUE_TEMPLATE/agent-verification-task.yml` | Hand a local-verification job to VS Code from GitHub text (not chat) | `agent:vscode`, `status:needs-local-verification` |
| Founder Approval Gate | `.github/ISSUE_TEMPLATE/founder-approval-gate.yml` | Pause at a permanent founder gate for a recorded decision | `status:needs-founder`, `agent:founder` |
| Issue chooser config | `.github/ISSUE_TEMPLATE/config.yml` | Keep blank issues on and link the canon docs | — |

All four write directly to `.github/ISSUE_TEMPLATE/` (no `workflows` scope needed), so they are applied on this branch. Only `.github/workflows/*` is blocked for the Opus integration.

## Ownership by area (default routing)

| Area | Default owner | Reviewer | Gate |
| --- | --- | --- | --- |
| `area:sprint-zero` | `agent:vscode` | `agent:opus` | — |
| `area:design-system` | `agent:vscode` | `agent:opus` | `gate:review` |
| `area:contracts` | `agent:codex` | `agent:opus` | `gate:test` |
| `area:ui` | `agent:vscode` | `agent:review` | `gate:review` |
| `area:database` | `agent:vscode` | `agent:opus` | founder (`db-destructive`) |
| `area:auth` | `agent:vscode` | `agent:opus` | founder (`auth`) |
| `area:billing` | `agent:codex` | `agent:opus` | founder (`money`) |
| `area:analytics` | `agent:codex` | `agent:review` | — |
| `area:docs` | `agent:claude` | `agent:opus` | — |
| `area:agent-governance` | `agent:opus` | founder | founder (`product-philosophy`) |

These are defaults, not laws — Opus may reroute when filing a build task. The current owner is always whoever holds the `agent:*` label. `agent:copilot-cloud` is not a default owner of any area; it is pulled in on demand for an optional cloud review/patch (see the cloud-review side-loop in [`relay-state-machine.md`](./relay-state-machine.md)).

## Merge authority

1. A PR may merge only when: it cleared review past `status:ready-for-review`, every required `gate:*` is satisfied, and no `blocked:*` or `freeze:all` is present.
2. Gated changes (`risk:approval-required` or a founder gate) require a recorded founder decision (via the `founder-approval-gate` issue form) before merge.
3. No agent merges its own un-reviewed work. There is **no auto-merge** anywhere in the relay. A `status:cloud-reviewed` from `agent:copilot-cloud` does **not** authorize merge and does not replace local verification or human review.
4. After merge: set `status:complete` and reconcile Notion canon if product truth changed.

## Routing in one line

> File task (`agent:opus`) → claim & build (`agent:vscode` / worker) → verify local → review (`agent:review`) → gate if needed (`agent:founder`) → merge → `status:complete`. *(Optional, parallel: `agent:copilot-cloud` review/patch → `status:cloud-reviewed`, advisory only.)*
