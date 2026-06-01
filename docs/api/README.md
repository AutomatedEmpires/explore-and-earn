# docs/api

API V1 documentation for Explore&Earn (planning stage — **DO NOT IMPLEMENT** without founder approval).

The canonical API plan lives in **`docs/architecture/backend-build-pack-v1.md`** and in Notion ("Route-Level API Contracts" + "API Contract Registry"). Notion = product/data canon; this repo = implementation truth.

## Conventions

- Namespace: `/api/v1/{domain}/{action}`.
- Thin route handlers in `apps/web/app/api/`; business logic in `apps/web/services/<domain>/`.
- Shared contracts in `packages/contracts/src/api.ts`: `ApiResponse<T>`, `ApiError`, `RequestContext`, error-code union.
- Every mutation calls `requireEntitlement(scope, action)` (G14).
- State-changing actions emit canonical events; sensitive/admin/billing/trust actions write `audit_logs` in the same transaction (G15).
- Billing webhook `/api/v1/billing/webhooks/stripe` must be idempotent (G17).

## Service boundaries

`matching` (pure score, no monetization imports — G8) · `discovery` (boost affects placement, not score) · `refund-review` (sole refund executor — G5) · `stripe` · `entitlements` · `notifications` · `moderation` (Azure provider — G27) · `messaging` (rate-limited — G26) · `media`.

## Hard rules

- No production auth/billing/matching logic at this stage.
- No seeker paywall, ever (G4).
- Do not invent routes, error codes, or behaviors. Unclear canon → `TODO(?)` + founder queue.
