# Contracts V1 — Execution Plan

> **Lane:** Backend / contracts spine (owner: Teach — architect).
> **Tracking issue:** Part of #47 (Backend Database & API V1).
> **Status:** Ungated. No database, no migrations, no live services. Pure typed substrate.
> **Canon (Notion = product truth):** Backend Architecture, Database & API V1 Build Pack §3–§4; Canonical Enum Registry — V1 Implementation Constants; Lifecycle Registry — Canonical V1 State Machines; Permission, Visibility & RLS Registry — V1 Access Rules; Canonical Event Registry; Founder Locked Pricing — Canonical Host Plans; API Contract Registry — V1 Implementation Interfaces.

## Why this is first

Every surface the seeker and host lanes are building runs on **typed fixtures, not data**. `packages/contracts` is the layer both dashboards import. Expanding it from the registries is the highest-leverage, lowest-risk unblock: it is ungated (no schema, no auth, no Stripe), and it lets feature lanes compose canonical shapes instead of inventing one-offs.

The foundation rule stands: `packages/contracts` is **lead-owned**. Feature lanes consume it; they do not redefine its shapes.

## Current state (branch cut from `main`)

Thin stubs from PR #3 + additive shapes from PR #4:

| File | State | Action |
| --- | --- | --- |
| `enums.ts` | stub (~333 B) | **Expand** — full SCREAMING_SNAKE_CASE constant tuples + derived branded types, mirroring the Enum Registry (G13). |
| `lifecycles.ts` | stub (~306 B) | **Expand** — per-entity allowed-transition maps consumed by `assert_lifecycle_transition()` (G16). |
| `permissions.ts` | stub (~298 B) | **Expand** — scopes (`seeker`/`host`/`admin`/`platform`), host team-role presets, admin sub-roles, action→role matrix; powers `requireEntitlement()` (G14). |
| `pricing.ts` | stub (~372 B) | **Expand** — `FOUNDER_LOCKED_PRICING` (cents) + founding-host discount tiers + `ADDON_PRICING` (G1, G23). |
| `events.ts` | stub (~230 B) | **Expand** — closed canonical event catalogue (mirror Canonical Event Registry). |
| `benefits.ts`, `categories.ts`, `card.ts`, `media.ts` | authored (PR #4) | **Do not duplicate.** |
| `api.ts` | **net-new (this PR)** | Shared `{ ok, data, meta }` envelope + `ApiErrorCode` union + `RequestContext`. |
| `retention.ts` | **net-new (TODO)** | PII table → retention window map (G28). |

## Scope of work (acceptance criteria)

1. **`api.ts`** — canonical `ApiResponse<T>` (`{ ok, data, meta }` / `{ ok, error, meta }`), `ApiError`, the closed `ApiErrorCode` union, and `RequestContext`. _(Seeded in this PR.)_
2. **`enums.ts`** — regenerate from the Enum Registry. `ListingCategory = farm · maritime · remote · seasonal · mix` exactly (no `lodge` — see #6). No invented values.
3. **`lifecycles.ts`** — transition maps for Application / Invite / Offer / HostAttestation / HostProfile / RefundReview / DisputeCase / ConversationThread / SchedulingRequest / MediaAsset / campaigns / reports / moderation / Review / CheckIn. Encode expiry rules (application 30d, invite 14d, offer 7d).
4. **`permissions.ts`** — scopes + team-role presets + admin sub-roles + action→role matrix.
5. **`pricing.ts`** — `FOUNDER_LOCKED_PRICING` in integer cents (starter 19900 / pro 39900 / enterprise 74900 monthly; 199000 / 399000 / 749000 annual), founding-host discount tiers, `ADDON_PRICING` (boost d7/d14/d28 = 20000/35000/50000; team seat 4900/mo; invite packs 25000/50000/75000 — non-refundable). Single source for the Stripe seed.
6. **`events.ts`** — closed event catalogue mirroring the registry.
7. **`retention.ts`** — PII table → retention window map covering every PII table (G28).
8. **Generation, not hand-editing** — enums/lifecycles/events are produced via `tools/scripts/sync-enums.ts` so contracts stay in lockstep with the registries (G13). Hand-edits are drift.
9. **`index.ts`** — export every module. Add `__type-tests__` coverage for the new unions.

## Guardrails this unblocks / must satisfy

- **G13** — contracts mirror the registries (no drift).
- **G16** — lifecycle transition maps are the single source for the DB trigger.
- **G14** — permission matrix powers `requireEntitlement()`.
- **G1 / G23** — money is integer cents only.
- **G3 / G6 / G7** — no `verified_status`, no `accepted_role`, no per-category listing types leaking into contracts.

## Explicitly NOT in scope (gated — do not touch here)

Migrations / live Supabase · RLS enablement · production auth · Stripe live mode · matching algorithm internals · any merge to `main`. This ships as a **Draft PR**.

## Founder ratifications that gate the *next* steps (not this one)

These block migrations/services, not the contracts expansion, but the contract values must match the decisions once ratified: **DR-B5** team-role names, **DR-B6** `listings.mix_domains`, **DR-B9** production auth wiring (and FQ-1…FQ-7 on #47).
