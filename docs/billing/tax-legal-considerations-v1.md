# Tax, Legal & Payment Terms — Considerations V1

> **DRAFT / DEFERRED.** This documents what must be decided later. It invents **no** tax rates, legal terms, or policy. Every item is `TODO(?)` pending founder + legal input and is blocked by gate **P-TAX**.

## Out of scope for V1 implementation

No tax calculation, no legal copy, no ToS/refund-policy text changes, no payment-terms enforcement are implemented in this pack.

## Items requiring decision (all `TODO(?)`)

| Topic | Question | Gate |
| --- | --- | --- |
| Tax collection | Use Stripe Tax for automatic calculation? Which jurisdictions at launch? | P-TAX |
| Nexus / registration | Where does Explore&Earn have tax nexus / obligations? | P-TAX |
| VAT / GST | Are non-US hosts in scope at launch? reverse-charge handling? | P-TAX |
| Invoicing & receipts | Stripe-generated invoices vs custom; legal entity, address, tax IDs on receipts | P-TAX |
| Refund terms | Codify refund-review policy + non-refundable invite credits in ToS | P-TAX + P-REFUND |
| Founding-rate terms | Legal wording for forever-locked founding pricing & forfeiture on cancel | P-TAX + P-PRICE |
| Dispute/chargeback | Representment policy; evidence packet ownership | P-TAX + P-REFUND |
| Payment methods | Cards only at launch? wallets? ACH? | P-TAX |
| Data retention | Retention window for billing PII / payment records | P-TAX |
| Currency | USD-only at launch? | P-TAX |

## Architecture hooks (no logic)

- Stripe object metadata reserves room for tax behavior (no values set here).
- `invoices` mirror reserves `amount_due_cents` / `amount_paid_cents` (cents, G1) to later carry tax breakdowns.
- Receipts/invoicing are Stripe-side until a decision is locked.

## Not implemented

No tax config, no legal text, no enforcement. Escalated to founder/legal via the approval queue.
