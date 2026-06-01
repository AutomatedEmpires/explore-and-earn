# Label System — the CLAOS Lite relay baton & routing

Labels move the **baton** and **route** work between agents with zero private chat. A glance
at an issue/PR's labels must answer:

1. **What state is this in?** → `status:*` (exactly one at a time)
2. **Whose turn is it?** → `agent:*` (exactly one at a time = current owner)
3. **Which part of the system is this?** → `area:*`
4. **How risky is it?** → `risk:*`
5. **Is a human or process gate involved?** → `gate:*` / `status:needs-founder` / `blocked:*` / `freeze:*`

> **This is the canonical CLAOS Lite label set.** It supersedes the informal status names used
> in earlier prose. **Seed commands** (exact `gh label create` lines) live in
> [`github-artifacts-to-apply.md`](./github-artifacts-to-apply.md) §4. Labels live in repo
> settings, not in committed files; if settings and this file drift, **this file wins** and
> the settings are the bug to fix.

## Agent labels (whose turn — one at a time)

| Label | Color | Who / what |
| --- | --- | --- |
| `agent:opus` | `#5319E7` | Notion/Opus — architect, reviewer, orchestrator |
| `agent:vscode` | `#1D76DB` | VS Code — local WSL verification environment (Copilot is the assistant inside it; the durable relay destination is the environment/role: VS Code) |
| `agent:codex` | `#0E8A16` | Codex — implementation/review |
| `agent:cursor` | `#0E8A16` | Cursor — implementation/review |
| `agent:claude` | `#0E8A16` | Claude — implementation/review |
| `agent:review` | `#FBCA04` | Awaiting code review |
| `agent:founder` | `#B60205` | Human — approval gates / taste / business calls only |

**Collision rule:** never leave two `agent:*` labels on one artifact. One agent, one task, one branch.

## Status labels (the baton — one at a time)

| Label | Color | Meaning |
| --- | --- | --- |
| `status:ready` | `#0E8A16` | Spec-complete (Build Pack / acceptance criteria). Pickable. |
| `status:claimed` | `#C2E0C6` | An agent has claimed it but not started. |
| `status:in-progress` | `#FBCA04` | A worker owns it and is implementing on a branch. |
| `status:needs-local-verification` | `#D4C5F9` | Awaiting local WSL verification (typecheck/lint/build/test). |
| `status:verified-local` | `#BFDADC` | Passed local verification. |
| `status:needs-opus-fix` | `#D93F0B` | Sent back to Opus for architecture/spec fixes. |
| `status:needs-review` | `#1D76DB` | Awaiting reviewer. |
| `status:ready-for-review` | `#0E8A16` | Prepared and ready for a reviewer to pick up. |
| `status:blocked` | `#B60205` | Blocked by a dependency or conflict. |
| `status:needs-founder` | `#B60205` | Awaiting a founder approval gate. |
| `status:complete` | `#5319E7` | Merged + docs reconciled (+ Notion updated if product truth changed). |

**Typical lifecycle:**

```
status:ready -> status:claimed -> status:in-progress -> status:needs-local-verification
  -> status:verified-local -> status:needs-review -> status:ready-for-review -> status:complete
```

Branches: `status:needs-opus-fix` (back to `status:in-progress`), `status:blocked`, and
`status:needs-founder` (gate) can interrupt at any point.

## Area labels (which part of the system)

| Label | Color | Meaning |
| --- | --- | --- |
| `area:sprint-zero` | `#0052CC` | Substrate / control plane |
| `area:design-system` | `#0052CC` | Tokens, primitives, component shells |
| `area:contracts` | `#0052CC` | `packages/contracts` types |
| `area:ui` | `#0052CC` | `packages/ui` primitives |
| `area:database` | `#0052CC` | Schema / data dictionary (gated) |
| `area:auth` | `#0052CC` | Authentication / sessions (gated) |
| `area:billing` | `#0052CC` | Pricing / Stripe (gated) |
| `area:analytics` | `#0052CC` | Events / PostHog |
| `area:docs` | `#0E8A16` | Documentation / canon |
| `area:agent-governance` | `#0052CC` | Relay, handoff, control-plane process |

## Risk labels

| Label | Color | Meaning |
| --- | --- | --- |
| `risk:low` | `#C2E0C6` | Low risk. |
| `risk:medium` | `#FBCA04` | Medium risk. |
| `risk:high` | `#D93F0B` | High risk. |
| `risk:approval-required` | `#B60205` | Requires founder approval before merge. |

## Gate labels

| Label | Color | Meaning |
| --- | --- | --- |
| `gate:review` | `#5319E7` | Human review gate. |
| `gate:test` | `#1D76DB` | Must pass CI/tests gate. |
| `gate:release` | `#B60205` | Release/deploy gate — founder only. |
| `gate:money` | `#B60205` | Pricing, plans, SKUs, Stripe, refunds, entitlements. |
| `gate:auth` | `#B60205` | Authentication, sessions, identity, secrets. |
| `gate:db-destructive` | `#B60205` | Schema changes, migrations, RLS, data deletion/drops. |
| `gate:permissions` | `#B60205` | Access control, team scopes, dashboard access. |
| `gate:trust-safety` | `#B60205` | Verified Host integrity, moderation, KYC. |
| `gate:legal` | `#B60205` | Terms, privacy, compliance. |
| `gate:asset-license` | `#B60205` | Paid icon, font, or media licensing. |
| `gate:launch` | `#B60205` | Production launch, public exposure, domain/DNS. |
| `gate:product-philosophy` | `#B60205` | Changes to locked principles or the Constitution. |

## Governance / freeze labels

| Label | Color | Meaning |
| --- | --- | --- |
| `canon:cited` | `#0E8A16` | Notion canon source cited in the PR. |
| `blocked:drift` | `#D93F0B` | Blocked: drifts from canon. |
| `blocked:conflict` | `#D93F0B` | Blocked: merge/ownership conflict. |
| `freeze:all` | `#B60205` | Global freeze — do not merge anything. |

The permanent founder gates these map to are defined in
[`founder-approval-gates.md`](./founder-approval-gates.md).

## Old → new name mapping (deprecated aliases — NOT active labels)

Earlier relay docs used a smaller informal set. These names are **deprecated aliases only**;
never create or apply them as active labels. Translate as:

| Earlier name (deprecated) | Canonical now |
| --- | --- |
| `status:ready-for-engineering` | `status:ready` |
| `status:in-review` | `status:needs-review` / `status:ready-for-review` |
| `status:changes-requested` | `status:needs-opus-fix` |
| `status:done` | `status:complete` |
| `agent:copilot` | `agent:vscode` |
