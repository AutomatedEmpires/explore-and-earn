# Billing Service Boundaries

> **DRAFT.** Defines where billing logic may live and the import rules between domains. No route handlers are implemented in this pack. Routes follow canon namespace `/api/v1/{domain}/{action}`; handlers stay **thin**, with core logic in packages (per "Route-Level API Contracts").

## Packages

- **`packages/contracts`** (exists) — type-only billing/entitlement/stripe/refund/route contracts (this pack).
- **`packages/billing`** (canon package, **not yet created**) — intended home for billing service logic; route handlers delegate here. Do not create until Phase P3 (founder-gated).
- **`packages/stripe-seed`** (exists) — test-mode seed; placeholders only in this pack.

## Services & routes (canon `/api/v1`)

| Path / module | Purpose | Auth | Scope/Role | Founder gate | Deferred |
| --- | --- | --- | --- | --- | --- |
| `POST /api/v1/billing/checkout` | create Stripe Checkout session | required | host | P-CHECKOUT | live session |
| `POST /api/v1/billing/webhook` | inbound Stripe webhooks | signature-verified (no scope) | service role | P-WEBHOOK | live deploy |
| `GET /api/v1/host/billing` | host plan + entitlement summary | required | host | — | read model wiring |
| `apps/web/services/stripe/` (→ `packages/billing`) | Stripe client wrapper, object-map lookups, session builders | server-only | host (self) | P-LIVEKEY, P-CHECKOUT, P-PORTAL | live calls |
| `apps/web/services/refund-review/` | **sole** holder of `stripe.refunds.create` (G5) | server-only | admin/founder | P-REFUND | automation |

## Shared contract shapes (canon)

Billing responses wrap in the shared `ApiResponse<T>` envelope; errors use `ApiError { code, message, field?, details? }` with `BillingErrorCode` values; auth/scope/entitlements come from the shared `RequestContext` (`activeScope`, `permissions`, `entitlements`). These shared types are canon (Route-Level API Contracts); `billing-routes.ts` defines billing payload DATA shapes that fit inside them.

## Import / boundary rules (CI-enforced)

- `services/matching` may **not** import pricing / entitlements / boost / featured (G8).
- Every mutation route calls server-side `requireEntitlement(...)` (G14).
- Billing/moderation mutations write an audit log entry in the same transaction (G15).
- No `STRIPE_SECRET_KEY` client-side; no billing code in public (non-server) routes.
- No pricing literals outside `pricing.ts` / catalog (G1); boost/team-seat constants in cents (G23).
- Risky surfaces default-off behind a flag (G20).

## Customer model

One Stripe Customer per `users.id`; mirror `host_profiles.stripe_customer_id`; one active subscription per host; upgrades use `proration_behavior='create_prorations'`; add-ons billed immediately via invoice items.

## Data mirror tables (conceptual, later)

See `../billing/data-mirror-erd-v1.md` for the conceptual ERD and `../billing/rls-billing-policy-v1.md` for RLS intent. No migrations in this pack.

## Seed & reconciliation

`packages/stripe-seed` is idempotent, test-mode, dry-run-first, with a live-mode hard stop; `src/manifest.ts` builds a deterministic manifest hash for CI drift checks against `expected-stripe-manifest.json`. Nightly `reconcileStripe()` diffs Stripe vs mirror → `admin_alerts`.
