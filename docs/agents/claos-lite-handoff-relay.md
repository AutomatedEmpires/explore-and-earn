# CLAOS Lite — Agent Handoff Relay

> **What this is:** the *minimum* GitHub-native communication layer that lets the
> Explore&Earn agents hand work to each other through **issues, pull requests,
> labels, comments, and checklists** — instead of private chat history or the
> founder copy/pasting messages between Opus and VS Code/Copilot.
>
> **What this is not:** the full CLAOS. No auto-merge, no deploy automation, no
> arbiter, no product features. This is the durable *relay substrate* only.

CLAOS Lite is the practical, enforceable subset of the specified-but-not-yet-enforced
CLAOS. It exists to remove **one specific bottleneck**: the founder acting as the
manual message bus between agents.

## 1. The problem we are solving

Today a unit of work often travels like this:

```
Opus (Notion) --> founder copies text --> VS Code/Copilot --> founder copies result --> Opus
```

The founder is the transport layer. That does not scale, loses context, and has no
audit trail. If a message lives only in a chat window, the next agent cannot see it,
so **it did not happen**.

## 2. The model CLAOS Lite enforces

Replace the founder-as-bus with durable GitHub artifacts:

```
Opus (Notion)  ──creates──>  GitHub Issue / draft PR
      ▲                              │
      │                             picks up
  reconcile                          ▼
      │                       VS Code / Copilot (verifies locally on WSL)
      │                              │
      └──── handoff comment <────────┘
```

- **Notion / Opus** — architect & reviewer. Creates architecture, issues, and draft PRs. Decides product truth.
- **GitHub** — the shared memory. Stores work, comments, labels, issues, handoffs.
- **VS Code / Copilot** — implementation worker. Verifies locally on Jackson's WSL machine.
- **Codex / Cursor / Claude** — may later take implementation/review tasks via the same relay.
- **Founder** — handles *approval gates* and taste/business decisions only. **Not** the message bus.

> Mantra (from `AGENTS.md`): **Notion decides. GitHub builds. Figma shows. Everything else runs.**

## 3. The relay primitives

Every handoff uses only these GitHub-native primitives:

| Primitive | Role in the relay |
| --- | --- |
| **Issue** | One unit of work. The queue entry. Carries source-of-truth link + acceptance criteria. |
| **Pull Request (draft)** | The proposal. The diff is the conversation. Draft until ready for a gate. |
| **Labels** | The baton + routing. Status, agent role, gate, priority, type. See [`label-system.md`](./label-system.md). |
| **Comments** | The handoff message. A structured comment hands the baton to the next agent. See [`handoff-protocol.md`](./handoff-protocol.md). |
| **Checklists** | The contract. Task/acceptance checkboxes show what is done and what remains. |

No private chat. No founder copy/paste. If it is not in one of the above, it is not part of the relay.

## 4. A single handoff, end to end

1. **Opus** writes a spec in Notion, then creates a GitHub issue (or draft PR) with the
   source link, scope, acceptance checklist, and a `status:*` + `agent:*` + (optional) `gate:*` label.
2. **A worker** (Copilot/Codex/Cursor/Claude) self-assigns, sets `status:in-progress`, works on a branch.
3. The worker opens or updates a **draft PR**, runs local verification on WSL, and leaves a
   **handoff comment** (the template in `handoff-protocol.md`) describing what was done, what was
   verified, and what the next agent must do.
4. The worker flips the baton: removes its own `agent:*`/`status:*`, sets the next ones
   (e.g. `status:in-review`, `agent:opus`).
5. **Opus / reviewer** reacts to the comment + diff, approves or requests changes via review,
   and either advances the baton or hands it back.
6. On approval, the founder (or, later, a guarded automation) handles any `gate:*` decision and merge.

The loop is detailed in [`closed-loop-workflow.md`](./closed-loop-workflow.md).

## 5. Scope of this PR (deliberately minimal)

**In scope**

- The relay *documentation* and conventions (this folder).
- A canonical label taxonomy (documented; created in repo settings by a human — see `label-system.md`).
- The structured handoff-comment convention.
- The closed-loop description that removes the founder-as-bus.

**Explicitly NOT in this PR**

- Full CLAOS or the arbiter system.
- Auto-merge of any kind.
- Production deploy automation.
- Auth, database schema, Stripe, matching, dashboards, or Discovery Card rendering.
- Any product feature code.

## 6. Where this sits in the autonomy ladder

This is the substrate for **rung 0 → rung 1/2** of the ladder in
[`cross-agent-workflow.md`](./cross-agent-workflow.md): durable handoffs by hand/label/comment,
with the founder still approving merges and all gates. It does **not** climb to auto-merge
(rung 3) — that stays gated behind CI guardrails, observability, and branch protection on `main`.

## 7. Product guardrails still apply

This relay carries product work, so it must protect Explore&Earn canon at every handoff. It is
**not** a generic job board. Preserve: Premium Adventure, Warm Working Landscape, Operational
Efficiency, card-first, mobile-first, zero bloat, the **Housing / Meals / Pay** triad, mandatory
**Verified Host**, canonical categories **farm / maritime / remote / seasonal / mix** (lodge is a
setting under *seasonal*, never a category), and **Streamline Freehand** as the icon direction with
**no proprietary icon assets committed without approval**.

## 8. Source of truth

- Repo: `AGENTS.md` §2 (golden rule), §5 (unit of work), §9 (when in doubt).
- Repo: [`cross-agent-workflow.md`](./cross-agent-workflow.md), [`handoff-protocol.md`](./handoff-protocol.md), [`founder-approval-gates.md`](./founder-approval-gates.md).
- Notion: *Build Context & Cross-Agent Operating Model*, *Autonomous Agent Operating System (AOS) — V1*, *Repository Mirror Plan*.
