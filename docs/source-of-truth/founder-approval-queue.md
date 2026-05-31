# Founder Approval Queue

Decisions that have hit a **founder approval gate** (see [`../agents/founder-approval-gates.md`](../agents/founder-approval-gates.md)) and are waiting on the founder. Agents must **not** implement past these lines. Add a row, then leave the related task in `backlog`.

| ID | Decision needed | Gate | Options / tradeoffs | Recommendation | Status |
| --- | --- | --- | --- | --- | --- |
| A-ICON-LICENSE | Purchase Streamline **Extended Vector License**? | Paid-asset licensing | Standard license caps usage at ~100 distinct icons/project. Extended lifts the cap. | Defer until the V1 distinct-icon inventory is counted; revisit before exceeding 100. | Waiting |
| A-PKGMGR | Confirm **pnpm + Turborepo** as the workspace toolchain (remove npm lockfile)? | (Process / not destructive to product) | pnpm+turbo is canon and better for a monorepo; npm lockfile currently present creates drift. | Approve pnpm + Turborepo; remove `package-lock.json` locally. | Waiting |
| A-NODE | Pin **Node 24.16.0** as canonical (override the Node 20 LTS canon)? | (Process) | 24 matches the machine; 20 LTS is broader-compat. | Pin 24 via `.nvmrc` per founder directive; update canon to match. | Waiting |
| A-ARCHIVE-V2 | Archive the old `exploreandearnv2` repo? | (Process) | Two repos cause agent confusion. | Archive after confirming nothing needed remains. | Waiting |

## Process

1. **Stop at the boundary** — never write code that crosses a gate.
2. Fill a row with: the decision, the gate, options + tradeoffs, and your recommendation.
3. The founder resolves it; the decision is recorded in Notion canon **first**.
4. Only then does the task become `ready-for-engineering`.

> Nothing in this queue authorizes implementation. It records what is *blocked on a human* and why.
