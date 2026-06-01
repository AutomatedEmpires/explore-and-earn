# Backend Decision Record — V1 (DR-B1 … DR-B14)

> **REVIEW ONLY — DO NOT MERGE / DO NOT IMPLEMENT.** This record resolves and **supersedes §10 "Open decisions" and §11 "TODO(?)" of `backend-build-pack-v1.md`.**
>
> The founder authorized the backend architect to determine every open question intentionally. Each decision below is the recommended V1 choice, with **Justification** (why) and **Defense** (why it is the best choice *for this application*). Decisions that change **product canon** (schema fields, enums, lifecycle states, permissions, billing) are marked **⚠ FOUNDER RATIFICATION REQUIRED** and are queued in `docs/source-of-truth/founder-approval-queue.md`; the rest are within backend-architect discretion. Notion = product/data canon; this repo = implementation truth.
>
> Draft artifacts produced alongside this record: `docs/database/schema-v1-draft.sql`, `docs/database/rls-v1-draft.sql`, `docs/api/contracts-v1-draft.ts`. They are blueprints, not runnable migrations.

---

## DR-B1 — Enum storage: `text` + `CHECK`, not native Postgres enums
**Decision.** Every enumerated column is `text` with a `CHECK (col IN (...))` constraint whose value list is **generated from the contracts package**, which itself mirrors the Canonical Enum Registry. No `CREATE TYPE ... AS ENUM`.
**Justification.** Native PG enums cannot remove or reorder values and require `ALTER TYPE ADD VALUE` (historically non-transactional, migration-hostile). The product is pre-PMF; enums will churn. `text`+`CHECK` regenerates cleanly and keeps the DB constraint, the contracts constants, and the Enum Registry in lockstep (satisfies G13 — enums imported from contracts).
**Defense.** For a fast-iterating marketplace, migration friction is the dominant cost; text+CHECK gives DB-level integrity *and* painless evolution. Lookup tables are used only where a value carries metadata (e.g. `lifecycle_transitions`).
**Status.** Architect discretion.

## DR-B2 — Primary keys: UUID (`gen_random_uuid()`), UUIDv7 path reserved
**Decision.** All PKs are `uuid default gen_random_uuid()`. High-insert tables (`discovery_impressions`, `analytics_events`, `messages`) are flagged for UUIDv7 (time-ordered) once available on the deployed Postgres.
**Justification.** UUIDs are non-enumerable (no leaking of listing/host/user counts), allow client-side generation, and decouple from a single sequence. v7 buys B-tree insert locality on hot tables.
**Defense.** Sequential integer IDs would let anyone scrape `/listings/1..N` and infer marketplace size and growth — unacceptable for a trust-first consumer marketplace. UUID is the correct default; the v7 note prevents index bloat on append-heavy tables.
**Status.** Architect discretion.

## DR-B3 — Money: integer minor units (cents), never float
**Decision.** All monetary values are `integer`/`bigint` cents. A reserved `currency char(3) default 'USD'` accompanies money columns. Ledger aggregates use `bigint`.
**Justification.** Floats accumulate rounding error across proration, credits, and refunds; Stripe itself uses minor units. Satisfies G1/G23 (pricing constants in cents).
**Defense.** Refund proration + FIFO service-credit math (G29) must be exact to the cent; a single rounding drift in billing is a trust and accounting failure.
**Status.** Architect discretion (pricing *values* remain ADR-028 founder-locked).

## DR-B4 — Soft delete for durable entities, hard delete for ephemera
**Decision.** `archived_at` (reversible hide) + `deleted_at` (trash) on durable entities (listings, applications, invites, offers, host/seeker profiles, media, messages, financial ledgers). Hard delete only for regenerable/ephemeral rows (`candidate_pools`, `discovery_sessions`, expired `notification_delivery_log`). PII scrubbed on retention schedule (G28) via a sweep job.
**Justification.** Disputes, refunds, and moderation require historical reconstruction; RLS + safe views keep soft-deleted rows out of public surfaces.
**Defense.** A refund dispute weeks later needs the *original* listing/application state; hard-deleting it would make the refund-review (G5) and audit trail (G15) impossible. Ephemeral caches carry no such obligation, so they are hard-deleted to control table bloat.
**Status.** Architect discretion; retention windows themselves are canon (G28).

## DR-B5 — `team_memberships.role_preset`: adopt the Permission/RLS Registry role set
**Decision.** Canonical roles = `owner, admin, hiring_manager, analyst, billing, viewer`. Legacy Data-Dictionary names map: `recruiter → hiring_manager`, `listing_manager → admin` (or `hiring_manager` where scoped to listings), `marketing → analyst`/`viewer`.
**Justification.** Registries win over the (historical) Data Dictionary. These names are *capability scopes*, mapping 1:1 to the RLS policies and the action→role matrix; job-title names (recruiter/marketing) do not.
**Defense.** Authorization must key off capabilities, not marketing titles, or RLS predicates become ambiguous and un-auditable. This is the only role set that lets `requireEntitlement()` (G14) and RLS share one matrix.
**Status.** **⚠ FOUNDER RATIFICATION REQUIRED** to formally retire the legacy names.

## DR-B6 — `mix` category semantics (grounded in the verified Ranking spec)
**Decision.** `mix` is a first-class `ListingCategory` meaning "spans multiple domains." In matching, **Role/Category Fit (15 pts)** treats `mix` as a *category-only* match (max 10 of 15) for any seeker whose desired domain is one of its constituents — **no multi-category affinity bonus**. To make this precise, **PROPOSE `listings.mix_domains text[]`** (subset of `farm|maritime|remote|seasonal`). If unratified, the safe fallback is: `mix` matches all four domains at the "category match only = 10" tier (never the full 15 "category+role" tier). `mix` is also a discovery surface — the Discovery spec already lists "relevant to Mix view" as a boost minimum-relevance path.
**Justification.** Verified against `Exact Ranking, Matching & Boost Formula` (Role/Category Fit tiers) and `Discovery, Boost & Feed Formula` (Mix-view boost eligibility). Neutral affinity prevents gaming — a host cannot tag `mix` to win every category feed.
**Defense.** Without `mix_domains`, `mix` either matches nobody (useless) or everybody (feed spam). The proposed array is the minimal precise fix; the fallback is deliberately conservative (capped at the category-only tier) so an un-ratified `mix` can never dominate discovery.
**Status.** **⚠ FOUNDER RATIFICATION REQUIRED** for `listings.mix_domains`.

## DR-B7 — Fold ADR-029 / refund / founding tables into their domain migrations
**Decision.** Because no migration has executed, do **not** append out-of-order files. Fold: attestation tables + `set_host_attestation()` + verified_status guard into `003_profiles`; `refund_reviews` + `dispute_cases` + `service_credit_ledger` + `stripe_webhook_events` + `founding_program_state` into `009_billing_entitlements`; `host_removal_appeals` into `011_reports_moderation_audit`; `notification_suppression_rules` into `008_notifications_events`.
**Justification.** A clean slate means there is no append-only history to preserve; domain-cohesive migrations are dependency-correct and far easier to review.
**Defense.** Splitting host trust across `003` and a distant `015` would break FK ordering and force reviewers to read two files for one concern. Cohesion maximizes reviewability — the entire point of a Build Pack.
**Status.** Architect discretion (migration *content* still founder-gated before any run).

## DR-B8 — Background jobs: Vercel Cron → protected routes, defer a separate `apps/jobs` project
**Decision.** V1 runs scheduled work as Vercel Cron hitting HMAC/shared-secret-guarded internal handlers under `apps/web/app/api/v1/jobs/*` (lifecycle expiry sweeps for applications 30d/invites 14d/offers 7d, analytics snapshots, Stripe reconciliation, media-moderation polling, service-credit expiry). Promote to a dedicated `apps/jobs` worker project only when a job exceeds serverless limits or needs a real queue.
**Justification.** Vercel Cron covers every V1 cadence; a second deployable adds secrets/observability/deploy overhead with no V1 payoff.
**Defense.** For a solo/small founding team, premature worker infrastructure is pure drag; the extraction path (move route logic into a worker) is cheap later. Right-sized infra beats speculative scale.
**Status.** Architect discretion.

## DR-B9 — Auth: Supabase Auth, email + magic link first; roles read from profile, not JWT
**Decision.** Passwordless email/magic-link first; OAuth (Google/Apple) deferred. 18+ self-attested age gate at signup (G25, no KYC vendor V1). A trigger on `auth.users` insert creates the `users` shadow row. Scope (`seeker`/`host`/`admin`) and team roles are read by RLS from profile/`team_memberships` rows, not from JWT custom claims, in V1.
**Justification.** Passwordless cuts credential-theft surface and onboarding friction for a mobile-first audience; the shadow table lets FKs/RLS reference a stable app-owned `users.id` without coupling to the `auth` schema.
**Defense.** Encoding roles in JWT claims needs custom access-token hooks and token reissue on every role change — complexity with no V1 benefit. Reading scope from RLS-visible rows is simpler and always current.
**Status.** **⚠ FOUNDER RATIFICATION REQUIRED** before wiring production auth (gated item).

## DR-B10 — Lifecycle enforcement: one table-driven trigger
**Decision.** A single `assert_lifecycle_transition()` trigger validates every status change against a seeded `lifecycle_transitions(entity, from_state, to_state)` table generated from `contracts/lifecycles.ts`. Expirations are performed by the sweep job via the canonical transition, never a raw status flip.
**Justification.** One enforcement mechanism = one audit point; data-driven means the contracts package stays the single source (G16).
**Defense.** Per-table bespoke triggers drift and are individually testable at best; a generic guard is uniformly fuzz-testable (G16) and impossible to bypass with an ad-hoc UPDATE.
**Status.** Architect discretion; transition tables themselves are canon (Lifecycle Registry).

## DR-B11 — RLS posture: deny-by-default + FORCE, public read only via security-barrier views
**Decision.** `ENABLE` + `FORCE ROW LEVEL SECURITY` on every user-facing table; no permissive default policy. Public/anon read flows exclusively through `security_barrier` views (`public_listings_view`, `public_host_profiles_view`, `public_community_feed_view`). The service role is used only inside server actions that have already passed `requireEntitlement()`.
**Justification.** Defense-in-depth: RLS is the backstop even if an app-layer check is forgotten (G14).
**Defense.** A marketplace holding PII + payment context cannot rely on application checks alone; one missed guard without RLS = a data breach. FORCE ensures even table owners obey policy.
**Status.** Architect discretion; final policies are a founder gate before enablement.

## DR-B12 — Stripe webhooks: `event_id` PK idempotency in the side-effect transaction
**Decision.** `stripe_webhook_events(event_id text primary key, type, payload jsonb, received_at, processed_at)`. The handler INSERTs `event_id` first inside the same transaction as its side effect; a unique violation means already-processed → no-op (G17).
**Justification.** Stripe redelivers events; a PK on `event_id` is the simplest exactly-once guard, and co-transaction with the effect makes processing atomic.
**Defense.** Double-processing a refund or subscription change is a direct financial loss; nothing less than atomic dedupe is acceptable on the money path.
**Status.** Architect discretion; live keys are a founder gate.

## DR-B13 — Service credits: append-only ledger, FIFO by expiry
**Decision.** `service_credit_ledger` is append-only with signed `amount_cents` and `source IN ('issued','redeemed','expired')`; issued lots carry `expires_at = issued_at + 12 months`. Consumption orders open positive lots by `expires_at`, then `created_at` (FIFO).
**Justification.** Append-only is fully auditable; FIFO-by-ordering avoids a mutable balance column that would lose lot-level expiry (G29).
**Defense.** Refund policy mandates FIFO + 12-month expiry; a single mutable balance cannot express which dollars expire when, so the ledger is the only correct shape.
**Status.** Architect discretion; refund behavior is ADR-015 canon.

## DR-B14 — Matching vs discovery separation (verified against canon formulas)
**Decision.** `services/matching` computes `match_score` (0–100; the 8 weighted components + hard modifiers/exclusions from the Ranking spec) and `match_confidence`, and is **forbidden from importing** pricing/entitlements/boost/featured (G8). `services/discovery` computes `display_score = relevance*0.40 + quality*0.15 + freshness*0.10 + engagement*0.10 + monetization*0.15 + diversity*0.10`, applies the shared eligibility gate, boost interleaving (≤1 boosted per 4-card window; 15–25% target with thin-pool caps of 10%/<10 and 15%/10–25), and records impressions.
**Justification.** Directly grounded in the verified `Exact Ranking, Matching & Boost Formula` and `Discovery, Boost & Feed Formula`: monetization is a *discovery-exposure* factor, never a *match* factor.
**Defense.** G8 is a hard guardrail and the heart of the product promise — if payment could buy match quality, seeker trust (the core value) collapses. The boundary is enforced by lint + a unit test asserting identical `match_score` for inputs differing only by plan tier.
**Status.** Architect discretion for the *boundary*; the algorithm implementation remains founder/algorithm-gated.

---

## Items routed to the founder-approval queue
- DR-B5 — retire legacy team-role names.
- DR-B6 — add `listings.mix_domains text[]`.
- DR-B9 — wire production Supabase Auth.
- All migration content, RLS enablement, Stripe live keys, attestation policy versioning (pre-existing gates).
