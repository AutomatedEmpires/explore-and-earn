# Founder Approval Gates

These are **permanent human gates**. No agent may implement, merge, or deploy across any of these lines without explicit founder approval — at *any* rung of the autonomy ladder. When a task touches a gate, stop and add an entry to [`../source-of-truth/founder-approval-queue.md`](../source-of-truth/founder-approval-queue.md).

## The gates

| Gate | Examples of what it covers |
| --- | --- |
| **Money / billing** | Pricing, plans, SKUs, entitlements, Stripe products, webhooks, refunds, proration, credits |
| **Auth / security** | Authentication flows, sessions, identity, secrets, security controls |
| **Database destructive** | Schema changes, migrations, RLS policy changes, data deletion, drops |
| **Permissions / RLS** | Access control, team scopes, dashboard access rules |
| **Verification / trust & safety** | Verified Host integrity, badge issuance, moderation rules, KYC scope |
| **Legal / policy** | Terms, agreements, privacy, compliance |
| **Paid-asset licensing** | Streamline Extended License, any commercial asset purchase |
| **Public launch / deploy** | Production deploys, going public, domain/DNS, marketing launch |
| **Major product philosophy** | Changes to locked principles or the Constitution |

## How to escalate (instead of implementing)

1. Do **not** write the code. Stop at the boundary.
2. Add a row to the founder approval queue with: the decision, why it is gated, options + tradeoffs, and your recommendation.
3. Leave the issue in `backlog` (not `ready-for-engineering`) until the founder resolves it.
4. Once approved, the decision is recorded in Notion canon **first**, then the task becomes `ready-for-engineering`.

## Why gates exist

Full autonomy from day one is how projects go off the rails. Gates let the relay run fast on low-risk work while keeping irreversible or high-trust decisions human. They are a feature, not a bottleneck.
