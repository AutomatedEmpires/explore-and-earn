# Founder Approval Queue

Decisions that have hit a **founder approval gate** (see [`../agents/founder-approval-gates.md`](../agents/founder-approval-gates.md)) and are waiting on the founder. Agents must **not** implement past these lines. Add a row, then leave the related task in `backlog`.

| ID | Decision needed | Gate | Options / tradeoffs | Recommendation | Status |
| --- | --- | --- | --- | --- | --- |
| A-ICON-LICENSE | Purchase Streamline **Extended Vector License**? | Paid-asset licensing | Standard license caps usage at ~100 distinct icons/project. Extended lifts the cap. | Defer until the V1 distinct-icon inventory is counted; revisit before exceeding 100. | Waiting |
| A-PKGMGR | Confirm **pnpm + Turborepo** as the workspace toolchain (remove npm lockfile)? | (Process / not destructive to product) | pnpm+turbo is canon and better for a monorepo; npm lockfile previously created drift. | Approved and applied in Sprint Zero substrate reconciliation. | Approved 2026-05-31 |
| A-NODE | Pin **Node 24.16.0** as canonical (override the Node 20 LTS canon)? | (Process) | 24 matches the machine; 20 LTS is broader-compat. | Approved and pinned in `.nvmrc` + CI. | Approved 2026-05-31 |
| A-ARCHIVE-V2 | Archive the old `exploreandearnv2` repo? | (Process) | Two repos cause agent confusion. | Archive after confirming nothing needed remains. | Waiting |
| A-CLAOS-UI-SMOKE | How should PR #7 validate GitHub issue-form and PR-template rendering before merge, given GitHub only exposes templates from the default branch? | (Process / GitHub platform constraint) | 1) Merge PR #7 after file/API validation, then verify live UI rendering on `main`; 2) temporarily change default branch or use a preview repo/fork to validate UI before merge; 3) block merge until a separate preview path exists. | Option 1. GitHub docs state issue templates/forms and PR templates in non-default branches are not available to collaborators, so pre-merge live-UI rendering for PR #7 cannot be truthfully confirmed in this repo before merge. | Retired — CLAOS archived; templates active on main |

## Process

1. **Stop at the boundary** — never write code that crosses a gate.
2. Fill a row with: the decision, the gate, options + tradeoffs, and your recommendation.
3. The founder resolves it; the decision is recorded in Notion canon **first**.
4. Only then does the task become `ready-for-engineering`.

> Nothing in this queue authorizes implementation. It records what is *blocked on a human* and why.
