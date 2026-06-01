# Label System — the relay baton & routing

Labels are how CLAOS Lite moves the **baton** and **routes** work between agents without
any private chat. A glance at an issue or PR's labels must answer three questions:

1. **What state is this in?** (`status:*`)
2. **Whose turn is it?** (`agent:*`)
3. **Is a human gate involved?** (`gate:*`)

Plus two descriptive axes: **priority** and **type**.

> **Setup note (human action):** GitHub labels live in repo settings, not in committed files,
> and the agent integration cannot reliably create them from a PR. A human (or `gh label create`)
> must seed the labels below once. This file is the **canonical definition**; settings must match it.
> This mirrors the `.github`/workflow write limitation noted in PR #1.

## 1. Status labels (the baton — exactly one at a time)

These mirror the status vocabulary in [`cross-agent-workflow.md`](./cross-agent-workflow.md).

| Label | Color | Meaning |
| --- | --- | --- |
| `status:backlog` | `#6b7280` | Captured, not yet spec-complete. Not pickable. |
| `status:ready-for-engineering` | `#0e8a16` | Spec-complete (Build Pack / acceptance criteria). Pickable. |
| `status:in-progress` | `#fbca04` | A worker owns it and is implementing on a branch. |
| `status:in-review` | `#1d76db` | A (draft or ready) PR exists; CI + reviewer are checking. |
| `status:changes-requested` | `#d93f0b` | Reviewer handed the baton back to the worker. |
| `status:blocked` | `#b60205` | Waiting on a `gate:*` decision or an external dependency. |
| `status:done` | `#5319e7` | Merged + docs updated (+ Notion updated if product truth changed). |

**Rule:** an issue/PR carries **one** `status:*` at a time. Changing it *is* moving the baton.

## 2. Agent-role labels (whose turn it is)

| Label | Color | Who / what |
| --- | --- | --- |
| `agent:opus` | `#5319e7` | Notion/Opus — architect, reviewer, orchestrator. |
| `agent:copilot` | `#1d76db` | VS Code / Copilot — implementation + local WSL verification. |
| `agent:codex` | `#0e8a16` | Codex — implementation/review (later). |
| `agent:cursor` | `#0e8a16` | Cursor — implementation/review (later). |
| `agent:claude` | `#0e8a16` | Claude — implementation/review (later). |
| `agent:founder` | `#b60205` | Human — only for approval gates / taste / business calls. |

**Rule:** at most **one** `agent:*` at a time = the current owner. Handing off swaps this label.
Never leave two `agent:*` labels on the same artifact (the collision rule).

## 3. Gate labels (human approval required)

When a task touches a permanent human gate (see [`founder-approval-gates.md`](./founder-approval-gates.md)),
add the matching `gate:*` label **and** `status:blocked`, then escalate in the approval queue.
No agent may merge or implement across a `gate:*` line without founder approval.

| Label | Gate |
| --- | --- |
| `gate:money` | Pricing, plans, SKUs, Stripe, refunds, entitlements |
| `gate:auth` | Authentication, sessions, identity, secrets |
| `gate:db-destructive` | Schema changes, migrations, RLS, data deletion/drops |
| `gate:permissions` | Access control, team scopes, dashboard access |
| `gate:trust-safety` | Verified Host integrity, badge issuance, moderation, KYC |
| `gate:legal` | Terms, privacy, compliance |
| `gate:asset-license` | Streamline Extended License / any paid asset |
| `gate:launch` | Production deploy, going public, domain/DNS |
| `gate:product-philosophy` | Changes to locked principles / the Constitution |

## 4. Priority labels

| Label | Color | Meaning |
| --- | --- | --- |
| `priority:p0` | `#b60205` | Drop everything (blocks the relay or substrate). |
| `priority:p1` | `#d93f0b` | Next up. |
| `priority:p2` | `#fbca04` | Normal queue. |
| `priority:p3` | `#c2e0c6` | Nice-to-have / later. |

## 5. Type labels

| Label | Color | Meaning |
| --- | --- | --- |
| `type:foundation` | `#0052cc` | Substrate / control-plane / relay work (e.g. this PR). |
| `type:design-system` | `#0052cc` | Tokens, primitives, component shells. |
| `type:discovery-card` | `#0052cc` | The core card primitive (Housing/Meals/Pay). |
| `type:database` | `#0052cc` | Schema from the canonical data dictionary (gated). |
| `type:feature` | `#0052cc` | A feature surface (its own Build Pack → issue → PR). |
| `type:docs` | `#0e8a16` | Documentation / canon. |
| `type:ci` | `#0e8a16` | Guardrails, workflows, drift checks. |
| `type:bug` | `#d93f0b` | Something is wrong / drifted from canon. |

## 6. Seed once (reference)

A human can seed the canonical set with `gh` (run from the repo, adjust as needed):

```bash
# status
gh label create "status:ready-for-engineering" -c 0E8A16
gh label create "status:in-progress" -c FBCA04
gh label create "status:in-review" -c 1D76DB
gh label create "status:changes-requested" -c D93F0B
gh label create "status:blocked" -c B60205
gh label create "status:done" -c 5319E7
# agents
gh label create "agent:opus" -c 5319E7
gh label create "agent:copilot" -c 1D76DB
# gates (examples)
gh label create "gate:db-destructive" -c B60205
gh label create "gate:asset-license" -c B60205
```

Keep this file and the repo's actual labels in sync — if they drift, this file wins as canon
and the settings are the bug to fix.
