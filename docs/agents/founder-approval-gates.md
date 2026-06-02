# Founder Approval Gates

These are **permanent human gates**. No agent may implement, merge, or deploy across any of these lines without explicit founder approval — at *any* rung of the autonomy ladder. When a task touches a gate, stop and add an entry to [`../source-of-truth/founder-approval-queue.md`](../source-of-truth/founder-approval-queue.md).

## The gates

| Gate | Relay label | Examples of what it covers |
| --- | --- | --- |
| **Money / billing** | `gate:money` | Pricing, plans, SKUs, entitlements, Stripe products, webhooks, refunds, proration, credits |
| **Auth / security** | `gate:auth` | Authentication flows, sessions, identity, secrets, security controls |
| **Database destructive** | `gate:db-destructive` | Schema changes, migrations, RLS policy changes, data deletion, drops |
| **Permissions / RLS** | `gate:permissions` | Access control, team scopes, dashboard access rules |
| **Verification / trust & safety** | `gate:trust-safety` | Verified Host integrity, badge issuance, moderation rules, KYC scope |
| **Legal / policy** | `gate:legal` | Terms, agreements, privacy, compliance |
| **Paid-asset licensing** | `gate:asset-license` | Streamline Extended License, any commercial asset purchase |
| **Public launch / deploy** | `gate:launch` | Production deploys, going public, domain/DNS, marketing launch |
| **Major product philosophy** | `gate:product-philosophy` | Changes to locked principles or the Constitution |

The `gate:*` labels are defined in [`label-system.md`](./label-system.md).

## How gates appear in the relay

When a task touches a gate, the owning agent must, **instead of implementing**:

1. Add the matching `gate:*` label **and** `status:blocked`.
2. Post a handoff comment swapping the baton to `agent:founder`.
3. Add a row to the founder approval queue (decision, why gated, options + tradeoffs, recommendation).
4. Leave the issue out of `status:ready-for-engineering` until the founder resolves it.

This keeps gated work visible and stalled-by-design in GitHub — never silently waiting in a chat.

## How to escalate (instead of implementing)

1. Do **not** write the code. Stop at the boundary.
2. Add a row to the founder approval queue with: the decision, why it is gated, options + tradeoffs, and your recommendation.
3. Leave the issue in `backlog`/`blocked` (not `ready-for-engineering`) until the founder resolves it.
4. Once approved, the decision is recorded in Notion canon **first**, then the task becomes `ready-for-engineering`.

## Why gates exist

Full autonomy from day one is how projects go off the rails. Gates let the relay run fast on low-risk work while keeping irreversible or high-trust decisions human. They are a feature, not a bottleneck.
