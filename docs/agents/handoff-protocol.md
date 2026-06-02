# Handoff Protocol

The mechanism that makes the relay continuous. Each step ends by leaving a **durable signal** that the next agent reacts to.

Under CLAOS Lite the durable signal is always a GitHub artifact — an issue, a draft PR, a label change, a review, or a **handoff comment** — never a private chat message and never the founder copying text between agents. See [`claos-lite-handoff-relay.md`](./claos-lite-handoff-relay.md) and [`closed-loop-workflow.md`](./closed-loop-workflow.md).

All labels referenced below use the canonical CLAOS Lite set in [`label-system.md`](./label-system.md). Deprecated/ambiguous names (`status:ready-for-engineering`, `status:in-review`, `status:changes-requested`, `status:done`, and bare `agent:copilot` — which must be disambiguated to `agent:vscode` for local WSL verification or `agent:copilot-cloud` for the GitHub cloud reviewer/coding agent) must not be applied as active labels.

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

> **Mentions matter:** writing `@copilot` in a handoff comment may start or route work to the GitHub **cloud** Copilot agent (`agent:copilot-cloud`); GitHub may also trigger an **automatic** Copilot PR review. If you mean the local WSL verifier, say "VS Code / `agent:vscode`" and do **not** type `@copilot`. Whatever the trigger, label cloud work `agent:copilot-cloud`.

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

## Role-specific handoff templates (the three legs of the Copilot loop)

These are ready-to-paste variants for the three transitions that involve the two Copilots.
They make the **cloud vs. local** distinction explicit so the baton never lands in the wrong
place. Cloud review is **optional and advisory**; the only path to `status:verified-local` is
through `agent:vscode` on the laptop.

### 1. Opus → Copilot Cloud (request an optional cloud review/patch)

```markdown
### 🤝 Handoff — Opus -> Copilot Cloud
- **From Agent:** agent:opus
- **To Agent:** agent:copilot-cloud   (trigger: @copilot mention below / auto Copilot review)
- **Status:** status:needs-cloud-review
- **PR / Branch:**
- **Source of Truth:**
- **What to review / optionally patch:**
- **Scope limits:** stay within the PR's stated scope; no product features, no secrets, no `.github/workflows/*`
- **This does NOT do:** it does NOT count as local WSL verification; `status:verified-local` stays with agent:vscode
- **Next step if passed:** set status:cloud-reviewed, hand to agent:vscode for LOCAL verification
- **Next step if failed:** set status:needs-opus-fix, hand back to agent:opus

@copilot please review this PR and, if confident, patch the branch within the scope above.
```

### 2. Copilot Cloud → VS Code (cloud done; local verification still required)

```markdown
### 🤝 Handoff — Copilot Cloud -> VS Code
- **From Agent:** agent:copilot-cloud
- **To Agent:** agent:vscode   (LOCAL WSL verification on Jackson's laptop)
- **Status:** status:needs-local-verification
- **PR / Branch:**
- **What the cloud agent changed:**
- **Why local verification is still required:** cloud review != local verification; a green cloud run does NOT prove Jackson's WSL toolchain passes
- **Commands to run (WSL):**
  ```bash
  gh pr checkout <number>
  pnpm install
  pnpm typecheck
  pnpm lint
  pnpm guardrails
  pnpm build   # if applicable
  pnpm test    # if applicable
  ```
- **Expected output:** all pass locally
- **Next step if passed:** set status:verified-local, hand to agent:review
- **Next step if failed:** set status:needs-opus-fix, hand to agent:opus
```

### 3. VS Code → Opus (local verification result back to the architect)

```markdown
### 🤝 Handoff — VS Code -> Opus
- **From Agent:** agent:vscode
- **To Agent:** agent:opus
- **Status:** status:verified-local   (or status:needs-opus-fix on failure)
- **PR / Branch:**
- **Local verification results (WSL):** paste pnpm install / typecheck / lint / guardrails / build / test output
- **What changed / what remains:**
- **Founder approval required:** <none | which gate>
- **Next step if passed:** agent:opus reviews -> status:ready-for-review -> founder merges if gate-clear
- **Next step if failed:** status:needs-opus-fix with notes for agent:opus
```

## A clean handoff includes

- [ ] A handoff comment using the template above.
- [ ] The artifact (issue/PR) clearly states what was done and what remains.
- [ ] Status label updated to reflect the new state (the baton moved).
- [ ] Exactly one `agent:*` label = the new owner (no collisions).
- [ ] A link back to the Notion source of truth.
- [ ] Any product-truth change reflected in Notion **before** marking `status:complete`.
- [ ] No two agents assigned to the same artifact.
- [ ] Cloud review (if used) recorded as `status:cloud-reviewed` only — never as `status:verified-local`.

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
