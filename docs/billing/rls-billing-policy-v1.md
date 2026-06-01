# RLS Billing Policy Intent V1

> **DRAFT / INTENT ONLY.** No RLS policies are enacted here. This documents the intended Supabase row-level security posture so the later migration PR is unambiguous. Scopes follow canon `ACTIVE_SCOPES = [seeker, host, admin, platform]`.

## Principles

- **Seekers have no access** to any billing table (no seeker paywall; G4).
- **Hosts** can read **only their own** billing rows (scoped by `customer_id -> users.id = auth.uid()` / host profile ownership). Hosts cannot write billing state directly — writes flow through service-role webhook + gated routes.
- **Admin / platform** roles get elevated read; mutations restricted to admin/founder and audit-logged (G15).
- **Service role** (webhook + seed + refund worker) performs system writes; never exposed to clients.

## Per-table intent

| Table | seeker | host | admin/platform | service role |
| --- | --- | --- | --- | --- |
| stripe_customers | none | read own | read all | write |
| subscriptions / items | none | read own | read all | write |
| invoices / payments | none | read own | read all | write |
| entitlement_grants / usage_counters | none | read own | read all | write |
| invite_credit_ledger | none | read own | read all | write |
| boost_purchases / invite_pack_purchases | none | read own | read all | write |
| refund_reviews | none | read own + create request | read all + decide | write (refund worker) |
| service_credit_ledger | none | read own | read all | write |
| billing_events / stripe_webhook_events | none | none | read all | write |
| stripe_object_map | none | none | read all | write (seed) |
| dispute_cases | none | read own | read all | write |

## Enforcement notes

- RLS is defense-in-depth; routes **also** call server-side `requireEntitlement` (G14) — RLS alone is not the entitlement check.
- Webhook writes use the service role behind signature verification, never a user JWT.
- Founder gate P-DEPLOY required before enabling these policies in production.
