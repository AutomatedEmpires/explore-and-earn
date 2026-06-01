# Handoff Protocol

The mechanism that makes the relay continuous. Each step ends by leaving a **durable signal** that the next agent reacts to.

Under CLAOS Lite the durable signal is always a GitHub artifact — an issue, a draft PR, a label change, a review, or a **handoff comment** — never a private chat message and never the founder copying text between agents. See [`claos-lite-handoff-relay.md`](./claos-lite-handoff-relay.md) and [`closed-loop-workflow.md`](./closed-loop-workflow.md).

All labels referenced below use the canonical CLAOS Lite set in [`label-system.md`](./label-system.md). Deprecated names (`status:ready-for-engineering`, `status:in-review`, `status:changes-requested`, `status:done`, `agent:copilot`) must not be applied as active labels.

## Steps

1. **Task born in Notion.** When spec-complete, it carries a Build Pack or acceptance criteria and is marked ready for engineering in Notion, which maps to the canonical `status:ready` label once dispatched to GitHub.
2. **Dispatch to GitHub.** A dispatcher creates a GitHub issue: title, body, acceptance criteria, labels, agent type, priority, and a link back to the Notion source. The issue URL is written back into Notion. *(Start with this one automation only — the Notion → GitHub Issue Dispatcher. Do not build all workers at once.)*
3. **Pick up.** A coding agent assigns itself, sets `status:in-progress` + `agent:<self>`, and works on a feature branch in WSL.
4. **Propose.** The agent opens a draft PR (`status:needs-review` once it is ready for a reviewer) using the PR template, linking the issue + Notion source.
5. **Verify.** CI guardrails (lint, typecheck, tests, drift checks) run automatically; a reviewer approves or requests changes (sent back as `status:needs-opus-fix`).
6. **Merge + reconcile.** On merge, repo docs update. If product truth changed, Notion + the Canonical Source Registry / decision log are updated.
7. **Flag next.** The next task is set `status:ready`, and the loop repeats.

## The handoff comment (the baton message)

Whenever an agent passes the baton, it posts **one structured comment** on the issue/PR, then
swaps the `status:*` and `agent:*` labels. Use the same field order as the reusable Agent
Handoff block in [`github-artifacts-to-apply.md`](./github-artifacts-to-apply.md) §5. The
comment — not chat — is the message to the next agent.

```markdown
### 🤝 Handoff
- **From Agent:**
- **To Agent:**
- **Status:**
- **PR / Branch:**
- **Source of Truth:**
- **What changed:**
- **What needs verification:**
- **Commands to run:**
- **Expected output:**
- **Founder approval required:**
- **Blocked by:**
- **Next step if passed:**
- **Next step if failed:**

**Implementation notes**
- ...

**Verified locally (WSL)**
- [ ] pnpm install
- [ ] pnpm typecheck
- [ ] pnpm lint
- [ ] pnpm build / test (as applicable)
```

After posting: remove your `agent:*` label, add the next owner's `agent:*`, and set the new `status:*`.

## A clean handoff includes

- [ ] A handoff comment using the template above.
- [ ] The artifact (issue/PR) clearly states what was done and what remains.
- [ ] Status label updated to reflect the new state (the baton moved).
- [ ] Exactly one `agent:*` label = the new owner (no collisions).
- [ ] A link back to the Notion source of truth.
- [ ] Any product-truth change reflected in Notion **before** marking `status:complete`.
- [ ] No two agents assigned to the same artifact.

## Issue body template (what a dispatched task should contain)

```
## Source of truth
<link to Notion canon page>

## Goal
<one-sentence outcome>

## Scope (in)
- ...

## Out of scope / forbidden
- ...

## Acceptance criteria
- [ ] ...

## Founder approval gate?
<none | which gate>
```

## Future workers (add only after the dispatcher proves out)

Canon Registry Auditor · Open Questions Escalator · Repo Mirror Tracker · Agent Handoff Manager. See the Notion *Repository Mirror Plan* and *Autonomous Agent Operating System (AOS) — V1*.
