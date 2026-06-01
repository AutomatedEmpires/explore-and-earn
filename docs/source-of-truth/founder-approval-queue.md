# Founder Approval Queue

Decisions that have hit a **founder approval gate** (see [`../agents/founder-approval-gates.md`](../agents/founder-approval-gates.md)) and are waiting on the founder. Agents must **not** implement past these lines. Add a row, then leave the related task in `backlog`.

| ID | Decision needed | Gate | Options / tradeoffs | Recommendation | Status |
| --- | --- | --- | --- | --- | --- |
| A-ICON-LICENSE | Purchase Streamline **Extended Vector License**? | Paid-asset licensing | Standard license caps usage at ~100 distinct icons/project. Extended lifts the cap. | Defer until the V1 distinct-icon inventory is counted; revisit before exceeding 100. | Waiting |
| A-PKGMGR | Confirm **pnpm + Turborepo** as the workspace toolchain (remove npm lockfile)? | (Process / not destructive to product) | pnpm+turbo is canon and better for a monorepo; npm lockfile previously created drift. | Approved and applied in Sprint Zero substrate reconciliation. | Approved 2026-05-31 |
| A-NODE | Pin **Node 24.16.0** as canonical (override the Node 20 LTS canon)? | (Process) | 24 matches the machine; 20 LTS is broader-compat. | Approved and pinned in `.nvmrc` + CI. | Approved 2026-05-31 |
| A-ARCHIVE-V2 | Archive the old `exploreandearnv2` repo? | (Process) | Two repos cause agent confusion. | Archive after confirming nothing needed remains. | Waiting |
| A-MATCH-WEIGHTS | Lock the final match **component weights** (and per-signal sub-weights)? | Final match weights | Canon documents weights (Timeline 20 / Skills 20 / Role 15 / HMP 15 / Location 10 / Goals 10 / Completeness 5 / Behavioral 5); sub-weights + tuning unconfirmed. | Keep documented in `match-score-model-v1.md`; do NOT encode in contracts until locked. | Waiting |
| A-MATCH-AI | Approve use of any **AI model / external AI API** for scoring or explanations? | AI model/API use | None connected. Could improve relevance but adds opacity/cost/privacy risk. | Stay heuristic + explainable for V1; revisit post-launch. | Waiting |
| A-MATCH-EXPL-STORE | Approve **storing** match explanations (vs deriving on read)? | Storing explanations | Storage aids audit but raises retention/privacy scope. | Derive on read for V1; store only if audit requires. | Waiting |
| A-MATCH-INACTIVITY | Approve **inactivity penalty** behavior + cold-start window + recovery curve? | Inactivity penalty | Internal-only; risk of over-penalizing early users. | Cautious, recoverable, explainable; no harsh penalty without canon. | Waiting |
| A-MATCH-HOST-RANK | Approve **host-visible ranking logic** (ordering + band thresholds)? | Host-visible ranking logic | G11 requires categorical bands; numeric cutoffs unset. | Propose Strong/Developing/Needs-attention; founder to set cutoffs. | Waiting |
| A-MATCH-SEEKER-COPY | Approve **seeker-visible score wording** (e.g., "Strong fit")? | Seeker-visible score wording | No-false-precision rule applies. | Lock copy with design; avoid precise % claims. | Waiting |
| A-MATCH-REMINDERS | Approve **automated reminders** (invite/offer expires-soon)? | Automated reminders | Needs Notification build pack + sending. | Events-only now; reminders after notification pack. | Waiting |
| A-OFFER-EXPIRY | Approve **offer expiration policy** (canon: 7 days after extended_at)? | Offer expiration policy | Canon value present; confirm before behavior ships. | Use 7d per canon; founder to ratify. | Waiting |
| A-NOT-SELECTED | Approve **not-selected behavior** (notify? reason capture? re-apply?)? | Not-selected behavior | Sensitive; affects seeker trust. | Neutral, non-shaming; no reason free-text in events. | Waiting |
| A-MATCH-PROXY | Approve **proxy-risk signal** use (location/credential/pay) + fairness policy? | Fairness/legal-sensitive + protected/sensitive signal | Legitimate but proxy risk for protected traits. | Tie to explicit listing requirements; founder/legal review before weight lock. | Waiting |
| A-MATCH-DEPLOY | Approve **production matching deployment**? | Production matching deploy | Whole system is forbidden-until-approved. | Block until all gates above clear + guardrails green. | Waiting |

## Process

1. **Stop at the boundary** — never write code that crosses a gate.
2. Fill a row with: the decision, the gate, options + tradeoffs, and your recommendation.
3. The founder resolves it; the decision is recorded in Notion canon **first**.
4. Only then does the task become `ready-for-engineering`.

> Nothing in this queue authorizes implementation. It records what is *blocked on a human* and why.
