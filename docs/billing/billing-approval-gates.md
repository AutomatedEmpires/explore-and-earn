# Billing Founder Approval Gates

> **DRAFT.** Each gate below blocks implementation until the founder explicitly approves. Agents must stop at these gates and escalate.

## Gate matrix

| Gate | Scope | Required before | Owner |
| --- | --- | --- | --- |
| P-PRICE | Plan/add-on/invite/boost pricing & names | any pricing change in `pricing.ts` or canon | Founder |
| P-UNIT | **Q-BILL-1** dollars→integer-cents normalization in `pricing.ts` | reconciling G1/G23 unit drift | Founder |
| P-ENT | Entitlement keys & grant mappings | any entitlement change | Founder |
| P-REFUND | Refund policy & automation | refund automation / policy change | Founder |
| P-LIVEKEY | Live Stripe keys | adding live keys to any env | Founder |
| P-PROD | Production Stripe products/prices/coupons | live-mode seed | Founder |
| P-WEBHOOK | Webhook deployment | registering production endpoint | Founder |
| P-CHECKOUT | Hosted checkout activation | enabling checkout | Founder |
| P-PORTAL | Billing portal activation | enabling portal | Founder |
| P-BOOST | Boost/visibility rules & surfaces | changing visibility mechanics | Founder |
| P-TAX | Tax / legal / payment terms | any tax/legal change | Founder |
| P-DEPLOY | Production billing deployment | shipping billing to prod | Founder |

## Escalation

If canon is unclear or a gate is hit, mark `TODO(?)`, do not proceed, and escalate via the Open Questions / Founder Approval Queue (Notion). Q-BILL-1 / Q-BILL-2 / Q-BILL-3 are open as of this pack.
