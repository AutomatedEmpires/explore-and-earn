# Founder Approval Queue

Decisions that have hit a **founder approval gate** (see [`../agents/founder-approval-gates.md`](../agents/founder-approval-gates.md)) and are waiting on the founder. Agents must **not** implement past these lines. Add a row, then leave the related task in `backlog`.

> **2026-05-31 — founder authorization.** The founder authorized the architect to determine the match weights, band thresholds, inactivity penalty, anti-spam caps, reminder policy, seeker copy, offer-expiry ratification, and not-selected behavior. Those rows are now **Approved** and recorded in [ADR-0001](./decisions/ADR-0001-matching-tuning-v1.md) + [`../matching/match-tuning-v1-decisions.md`](../matching/match-tuning-v1-decisions.md). Production deploy, AI use, and the proxy/legal review remain gated.

| ID | Decision needed | Gate | Options / tradeoffs | Recommendation | Status |
| --- | --- | --- | --- | --- | --- |
| A-ICON-LICENSE | Purchase Streamline **Extended Vector License**? | Paid-asset licensing | Standard license caps usage at ~100 distinct icons/project. Extended lifts the cap. | Defer until the V1 distinct-icon inventory is counted; revisit before exceeding 100. | Waiting |
| A-PKGMGR | Confirm **pnpm + Turborepo** as the workspace toolchain (remove npm lockfile)? | (Process / not destructive to product) | pnpm+turbo is canon and better for a monorepo; npm lockfile previously created drift. | Approved and applied in Sprint Zero substrate reconciliation. | Approved 2026-05-31 |
| A-NODE | Pin **Node 24.16.0** as canonical (override the Node 20 LTS canon)? | (Process) | 24 matches the machine; 20 LTS is broader-compat. | Approved and pinned in `.nvmrc` + CI. | Approved 2026-05-31 |
| A-ARCHIVE-V2 | Archive the old `exploreandearnv2` repo? | (Process) | Two repos cause agent confusion. | Archive after confirming nothing needed remains. | Waiting |
| A-MATCH-WEIGHTS | Lock the final match **component weights** (and per-signal sub-weights)? | Final match weights | Canon documents top-level weights; sub-weights were unconfirmed. | Locked in `matching-config.ts` (top-level canon + architect sub-weights); justified in ADR-0001 §1-§2. | Approved 2026-05-31 |
| A-MATCH-AI | Approve use of any **AI model / external AI API** for scoring or explanations? | AI model/API use | None connected. Could improve relevance but adds opacity/cost/privacy risk. | V1 stays heuristic + explainable; intentionally NOT using AI. Revisit post-launch with an explainability story. | Approved 2026-05-31 (V1 = no AI) |
| A-MATCH-EXPL-STORE | Approve **storing** match explanations (vs deriving on read)? | Storing explanations | Storage aids audit but raises retention/privacy scope. | Derive on read; persist structured reasons only — gate not crossed (ADR-0001 §13). | Approved 2026-05-31 (no storage) |
| A-MATCH-INACTIVITY | Approve **inactivity penalty** behavior + cold-start window + recovery curve? | Inactivity penalty | Internal-only; risk of over-penalizing early users. | Locked: affects behavioral 5 pts only; 14d+3-opportunity grace; 0.5 floor; never hides (ADR-0001 §5). | Approved 2026-05-31 |
| A-MATCH-HOST-RANK | Approve **host-visible ranking logic** (ordering + band thresholds)? | Host-visible ranking logic | G11 requires categorical bands; numeric cutoffs were unset. | Locked: Strong 75-100 / Developing 50-74 / Needs attention 0-49 (ADR-0001 §6). | Approved 2026-05-31 |
| A-MATCH-SEEKER-COPY | Approve **seeker-visible score wording** (e.g., "Strong fit")? | Seeker-visible score wording | No-false-precision rule applies. | Locked: Strong fit / Good fit / Partial fit; "Why this fits"; no sub-percent precision (ADR-0001 §12). | Approved 2026-05-31 (design polish welcome) |
| A-MATCH-REMINDERS | Approve **automated reminders** (invite/offer expires-soon)? | Automated reminders | Needs Notification build pack + sending. | Reminder POLICY locked (T-3/T-1; max 2/object). SENDING still deferred to the Notification build pack. | Approved 2026-05-31 (policy; sending deferred) |
| A-OFFER-EXPIRY | Approve **offer expiration policy** (canon: 7 days after extended_at)? | Offer expiration policy | Canon value present; confirm before behavior ships. | Ratified 7d (ADR-0001 §10). | Approved 2026-05-31 |
| A-NOT-SELECTED | Approve **not-selected behavior** (notify? reason capture? re-apply?)? | Not-selected behavior | Sensitive; affects seeker trust. | Locked: neutral; no reason exposed/stored; no seeker matching penalty; re-apply 30d/re-open, max 2/yr (ADR-0001 §11). | Approved 2026-05-31 |
| A-MATCH-PROXY | Approve **proxy-risk signal** use (location/credential/pay) + fairness policy? | Fairness/legal-sensitive + protected/sensitive signal | Legitimate but proxy risk for protected traits. | Weights locked with signals tied to explicit listing requirements; **legal review still recommended before production**. | Conditionally approved 2026-05-31 (legal review before prod) |
| A-MATCH-DEPLOY | Approve **production matching deployment**? | Production matching deploy | Whole system is forbidden-until-approved. | Block until guardrails (incl. proposed G31-G34) green + human merge + legal review of proxy signals. | Waiting |

## Process

1. **Stop at the boundary** — never write code that crosses a gate.
2. Fill a row with: the decision, the gate, options + tradeoffs, and your recommendation.
3. The founder resolves it; the decision is recorded in Notion canon **first** (canon-sync owed for the 2026-05-31 batch — see open-questions).
4. Only then does the task become `ready-for-engineering`.

> Nothing in this queue authorizes implementation of the production scoring engine. Approved rows authorize the **locked configuration**; the engine that consumes it remains gated by A-MATCH-DEPLOY.
