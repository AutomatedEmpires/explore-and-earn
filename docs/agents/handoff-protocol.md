# Handoff Protocol

The mechanism that makes the relay continuous. Each step ends by leaving a **durable signal** that the next agent reacts to.

## Steps

1. **Task born in Notion.** When spec-complete, it is marked `Ready for Engineering` and carries a Build Pack or acceptance criteria.
2. **Dispatch to GitHub.** A dispatcher creates a GitHub issue: title, body, acceptance criteria, labels, agent type, priority, and a link back to the Notion source. The issue URL is written back into Notion. *(Start with this one automation only — the Notion → GitHub Issue Dispatcher. Do not build all workers at once.)*
3. **Pick up.** A coding agent assigns itself, sets `in-progress`, and works on a feature branch in WSL.
4. **Propose.** The agent opens a PR (`in-review`) using the PR template, linking the issue + Notion source.
5. **Verify.** CI guardrails (lint, typecheck, tests, drift checks) run automatically; a reviewer approves or requests changes.
6. **Merge + reconcile.** On merge, repo docs update. If product truth changed, Notion + the Canonical Source Registry / decision log are updated.
7. **Flag next.** The next task is set `ready-for-engineering`, and the loop repeats.

## A clean handoff includes

- [ ] The artifact (issue/PR) clearly states what was done and what remains.
- [ ] Status label updated to reflect the new state (the baton moved).
- [ ] A link back to the Notion source of truth.
- [ ] Any product-truth change reflected in Notion **before** marking `done`.
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
