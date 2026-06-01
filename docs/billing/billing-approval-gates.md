# Billing Founder Approval Gates

> **DRAFT.** Each gate blocks implementation until the founder explicitly approves. Agents must STOP at these gates and escalate — never self-approve.

## Gate matrix

| Gate | Scope | Trigger (what hits the gate) | Evidence required to approve | Reversible? | Blocking phase |
| --- | --- | --- | --- | --- | --- |
| P-PRICE | Plan/add-on/invite/boost pricing & names | any change to `pricing.ts` or pricing canon | canon diff + ADR ref | Yes (config) | P1 |
| P-UNIT | **Q-BILL-1** dollars→integer-cents normalization | reconciling G1/G23 unit drift | before/after values, test proof | Yes | P1 |
| P-ENT | Entitlement keys & grant mappings | add/remove key or change grant map | mapping table diff | Yes | P1 |
| P-PROD | Production Stripe products/prices/coupons | live-mode seed | manifest hash + dry-run output | Hard to reverse | P6 |
| P-SEED | **Test-mode** seed WRITE (beyond dry-run) | seed creating test objects | dry-run report + manifest match | Yes (test data) | P4 |
| P-LIVEKEY | Live Stripe secret keys | adding `sk_live_*` to any env | key custody plan | No (rotate only) | P6 |
| P-WEBHOOK | Webhook deployment | registering production endpoint | endpoint + signature secret plan | Yes (disable) | P5/P6 |
| P-CHECKOUT | Hosted checkout activation | enabling checkout | route + flag review | Yes (flag) | P6 |
| P-PORTAL | Billing portal activation | enabling Stripe portal | portal config review | Yes (flag) | P6 |
| P-REFUND | Refund policy & automation | refund automation / policy change | policy ref + scope | Yes | P5 |
| P-BOOST | Boost/featured rules, surfaces & exposure caps | changing visibility mechanics/caps | cap config + ethics review | Yes (config) | P3+ |
| P-TAX | Tax / legal / payment terms | any tax/legal/ToS change | legal sign-off | Varies | P6 |
| P-DEPLOY | Production billing deployment | shipping billing to prod | full checklist + all gates green | Hard to reverse | P6 |

## Default-off principle

Every monetization surface ships behind a default-off flag (G20). A gate approval flips config/flags; it does not bypass CI guardrails.

## Escalation

If canon is unclear or a gate is hit, mark `TODO(?)`, do **not** proceed, and escalate via the Open Questions / Founder Approval Queue (Notion). Open as of this pack: **Q-BILL-1** (P-UNIT), **Q-BILL-2**, **Q-BILL-3**.
