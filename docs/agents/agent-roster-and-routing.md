# Agent Roster & Routing

This is the directory of actors in the CLAOS Lite relay and the rules for who picks up what,
who reviews, and who is allowed to merge. The relay routes by **label**, but a label is
meaningless without a shared definition of each agent's job. This file is that definition.

> One `agent:*` label = the current owner. Routing = swapping that label per the rules below.
> Status transitions and stall handling live in [`relay-state-machine.md`](./relay-state-machine.md).

## Roster & capabilities

| Agent | Label | Primary role | Can do | Must NOT do |
| --- | --- | --- | --- | --- |
| Opus (Notion) | `agent:opus` | Architect / orchestrator / reviewer | Write specs & Build Packs, file build tasks, review PRs, reconcile canon, route the baton | Merge gated work without founder; write `.github/workflows/*` (lacks scope) |
| VS Code / Copilot | `agent:vscode` | Local implementer + verifier (WSL) | Implement on branches, run typecheck/lint/build/test locally, apply `.github/workflows/*`, seed labels | Approve own gated work; merge without review |
| Codex | `agent:codex` | Implementer / reviewer | Implement, review, propose diffs | Merge gated work; bypass verification |
| Cursor | `agent:cursor` | Implementer / reviewer | Implement, review, refactor | Merge gated work; bypass verification |
| Claude | `agent:claude` | Implementer / reviewer | Implement, review, write docs | Merge gated work; bypass verification |
| Review | `agent:review` | Review-queue marker | Signals "a reviewer must act" | n/a (state marker, not a person) |
| Founder | `agent:founder` | Human decision-maker | Open/close gates, set taste & business direction, authorize merges past gates | Hand-carry status between agents (the relay does that now) |

## Capability boundaries (hard rules)

- **Workflow files (`.github/workflows/*`):** only an actor with the GitHub `workflows` scope can write these. Opus's integration cannot; route such writes to `agent:vscode` or a human. See [`github-artifacts-to-apply.md`](./github-artifacts-to-apply.md).
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

These are defaults, not laws — Opus may reroute when filing a build task. The current owner is always whoever holds the `agent:*` label.

## Merge authority

1. A PR may merge only when: it cleared review past `status:ready-for-review`, every required `gate:*` is satisfied, and no `blocked:*` or `freeze:all` is present.
2. Gated changes (`risk:approval-required` or a founder gate) require a recorded founder decision (via the `founder-approval-gate` issue form) before merge.
3. No agent merges its own un-reviewed work. There is **no auto-merge** anywhere in the relay.
4. After merge: set `status:complete` and reconcile Notion canon if product truth changed.

## Routing in one line

> File task (`agent:opus`) → claim & build (`agent:vscode` / worker) → verify local → review (`agent:review`) → gate if needed (`agent:founder`) → merge → `status:complete`.
