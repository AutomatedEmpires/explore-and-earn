# Closed-Loop Workflow — removing the founder as the message bus

This is the end-to-end loop CLAOS Lite makes durable. Its single design goal: **no step
depends on the founder copy/pasting a message between agents.** Every handoff lands in a
GitHub artifact the next agent can read on its own.

Read alongside [`claos-lite-handoff-relay.md`](./claos-lite-handoff-relay.md) (the why/what),
[`handoff-protocol.md`](./handoff-protocol.md) (the comment mechanics), and
[`label-system.md`](./label-system.md) (the baton).

## The loop

```mermaid
flowchart TD
  N["Notion / Opus: canon + Build Pack"] --> I["GitHub Issue created\nstatus:ready + agent:vscode"]
  I --> C["Worker self-assigns\nstatus:claimed"]
  C --> P["Work starts on a branch\nstatus:in-progress\nbranch + draft PR"]
  P --> V["Local verify on WSL\nstatus:needs-local-verification\n(typecheck / lint / build / tests)"]
  V --> H["Handoff comment posted\nbaton -> agent:review, status:needs-review"]
    H --> R{"Opus / reviewer\nreview + CI"}
  R -->|changes requested| F["status:needs-opus-fix\nbaton -> agent:opus"]
  F --> P
  R -->|gate touched| G["status:needs-founder + gate:*\nfounder approval queue"]
    G -->|approved| R
  R -->|approved, no gate| M["Founder merges\nstatus:complete + repo docs updated"]
    M --> RC["Reconcile: Notion updated if\nproduct truth changed"]
  RC --> NEXT["Next issue flagged\nstatus:ready"]
    NEXT --> I
  R -. "optional: @copilot / auto review" .-> CR["Cloud Copilot review/patch\nstatus:needs-cloud-review -> status:cloud-reviewed\n(advisory; NOT local verification)"]
    CR -. "rejoin" .-> R
```

## What makes the loop *closed*

Each arrow is a **durable artifact**, never a chat message:

| Transition | Durable carrier (not chat) |
| --- | --- |
| Notion → work queued | GitHub **issue** with source link + acceptance checklist |
| Worker → reviewer | Draft **PR** + **handoff comment** + label swap |
| Reviewer → worker | **PR review** + label swap to `status:needs-opus-fix` |
| Optional cloud review | `@copilot` / auto Copilot **PR review** + `status:needs-cloud-review` -> `status:cloud-reviewed` (advisory) |
| Anything → gate | `gate:*` + `status:needs-founder` or `status:blocked` + **approval-queue** row |
| Merge → next | `status:complete`, updated repo docs, next issue `status:ready` |

If a transition has no artifact, the baton has not actually moved — fix the artifact, do not
DM the founder.

## The founder's only touchpoints

The founder is deliberately removed from transport and kept only where human judgment is required:

1. **Approval gates** — anything labelled `gate:*` (see [`founder-approval-gates.md`](./founder-approval-gates.md)).
2. **Merge** — pressing merge on an approved PR (until a future, guarded auto-merge rung).
3. **Taste / business calls** — product philosophy, brand, and priorities.

Everything else is agent-to-agent through GitHub.

## Roles in one line each

- **Opus (Notion)** — architect / PR author; turns canon into issues/draft PRs; reviews; reconciles Notion after merges; cannot run code locally.
- **VS Code / `agent:vscode`** — the **local laptop / WSL verifier**: picks up `status:ready`, implements, runs `pnpm install / lint / typecheck / guardrails / build / test` on Jackson's machine, opens/updates the draft PR, and is the **only** actor that can set `status:verified-local`.
- **GitHub Copilot cloud / `agent:copilot-cloud`** — optional cloud reviewer/coding agent triggered by `@copilot` or automatic Copilot PR review; can review/comment/patch a PR, sets `status:cloud-reviewed` (advisory). **Does not** verify local WSL and never replaces `agent:vscode`.
- **Codex / Cursor / Claude** — same relay, additional implementation/review hands when introduced.
- **CI guardrails** — lint, typecheck, tests, drift checks; the automated reviewer that must pass before a human merge.
- **Founder** — gates + merge + taste only.

## Guardrails this loop must never cross

- One agent owns one task on one branch at a time (the **collision rule**).
- No auto-merge, no deploy automation, no arbiter in CLAOS Lite. A `status:cloud-reviewed` never authorizes merge.
- Product canon is protected at every handoff: not a generic job board — Premium Adventure,
  Warm Working Landscape, Operational Efficiency, card-first, mobile-first, zero bloat, the
  **Housing / Meals / Pay** triad, mandatory **Verified Host**, canonical categories
  **farm / maritime / remote / seasonal / mix** (lodge is a *setting* under seasonal, not a
  category), and **Streamline Freehand** icons with **no proprietary assets committed without approval**.
- Build order is respected: Sprint Zero → Design System V1 → Discovery Card V1 → Database V1 → features.
  This relay is foundation work; it does not jump ahead to Discovery Card V1.

## Definition of a healthy loop

- Any agent can open the repo cold and know the exact state from labels + the latest handoff comment.
- No work item is waiting on a message that exists only in someone's chat history.
- Every product-truth change is reflected in Notion **before** the issue is marked `status:complete`.
