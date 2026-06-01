# Label System — the CLAOS Lite relay baton & routing

Labels move the **baton** and **route** work between agents with zero private chat. A glance
at an issue/PR's labels must answer:

1. **What state is this in?** → `status:*` (exactly one at a time)
2. **Whose turn is it?** → `agent:*` (exactly one at a time = current owner)
3. **Is a human gate involved?** → `gate:*` / `risk:approval-required` / `status:needs-founder`

Plus descriptive axes: **`area:*`** (which part of the system) and **`risk:*`**.

> **This is the canonical CLAOS Lite label set.** It supersedes the informal status names used
> in earlier prose. **Seed commands** (exact `gh label create` lines) live in
> [`github-artifacts-to-apply.md`](./github-artifacts-to-apply.md) §4. Labels live in repo
> settings, not in committed files; if settings and this file drift, **this file wins** and
> the settings are the bug to fix.

## Agent labels (whose turn — one at a time)

| Label | Who / what |
| --- | --- |
| `agent:opus` | Notion/Opus — architect, reviewer, orchestrator |
| `agent:vscode` | VS Code / Copilot — implementation + local WSL verification |
| `agent:codex` | Codex — implementation/review |
| `agent:cursor` | Cursor — implementation/review |
| `agent:claude` | Claude — implementation/review |
| `agent:review` | Awaiting code review |
| `agent:founder` | Human — approval gates / taste / business calls only |

**Collision rule:** never leave two `agent:*` labels on one artifact. One agent, one task, one branch.

## Status labels (the baton — one at a time)

| Label | Meaning |
| --- | --- |
| `status:ready` | Spec-complete (Build Pack / acceptance criteria). Pickable. |
| `status:claimed` | An agent has claimed it but not started. |
| `status:in-progress` | A worker owns it and is implementing on a branch. |
| `status:needs-local-verification` | Awaiting local WSL verification (typecheck/lint/build/test). |
| `status:verified-local` | Passed local verification. |
| `status:needs-opus-fix` | Sent back to Opus for architecture/spec fixes. |
| `status:needs-review` | Awaiting reviewer. |
| `status:ready-for-review` | Prepared and ready for a reviewer to pick up. |
| `status:blocked` | Blocked by a dependency or conflict. |
| `status:needs-founder` | Awaiting a founder approval gate. |
| `status:complete` | Merged + docs reconciled (+ Notion updated if product truth changed). |

**Typical lifecycle:**

```
status:ready -> status:claimed -> status:in-progress -> status:needs-local-verification
  -> status:verified-local -> status:needs-review -> status:ready-for-review -> status:complete
```

Branches: `status:needs-opus-fix` (back to `status:in-progress`), `status:blocked`, and
`status:needs-founder` (gate) can interrupt at any point.

## Area labels (which part of the system)

`area:sprint-zero` · `area:design-system` · `area:contracts` · `area:ui` · `area:database` ·
`area:auth` · `area:billing` · `area:analytics` · `area:docs` · `area:agent-governance`

## Risk labels

| Label | Meaning |
| --- | --- |
| `risk:low` | Low risk. |
| `risk:medium` | Medium risk. |
| `risk:high` | High risk. |
| `risk:approval-required` | Requires founder approval before merge. |

## Gate / governance / freeze labels

| Label | Meaning |
| --- | --- |
| `gate:review` | Human review gate. |
| `gate:test` | Must pass CI/tests gate. |
| `gate:release` | Release/deploy gate — founder only. |
| `canon:cited` | Notion canon source cited in the PR. |
| `blocked:drift` | Blocked: drifts from canon. |
| `blocked:conflict` | Blocked: merge/ownership conflict. |
| `freeze:all` | Global freeze — do not merge anything. |

The permanent founder gates these map to are defined in
[`founder-approval-gates.md`](./founder-approval-gates.md).

## Old → new name mapping (for earlier docs)

Earlier relay docs used a smaller informal set. Translate as:

| Earlier name | Canonical now |
| --- | --- |
| `status:ready-for-engineering` | `status:ready` |
| `status:in-review` | `status:needs-review` / `status:ready-for-review` |
| `status:done` | `status:complete` |
| `agent:copilot` | `agent:vscode` |
| `gate:*` per [`founder-approval-gates.md`](./founder-approval-gates.md) | unchanged (still the gate set) |
