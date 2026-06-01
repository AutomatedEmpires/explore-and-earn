# Backend Architecture, Database & API V1 Build Pack

> **PLANNING ARTIFACT — DO NOT IMPLEMENT / DO NOT MERGE.**
> This document prepares the backend foundation for implementation by VS Code/Codex/Copilot agents.
> It contains **no executed migrations, no live Supabase changes, no Stripe live actions, and no production auth/billing/matching logic.**
> Everything here is a reviewable draft gated behind founder approval.
>
> Canonical source of truth lives in Notion: **"Backend Architecture, Database & API V1 Build Pack"** under the Explore&Earn Source of Truth — Master Index. Notion = product/data canon; this repo = implementation truth. If the two disagree, **Notion wins** and the repo is corrected.

Author: Opus (backend architect) · Date: 2026-05-31

---

## 0. Scope & operating model

Backend foundation only: database schema, Supabase strategy, RLS/security model, API/service boundaries, contracts, and implementation sequencing. Stops at the founder approval line.

Operating model: Notion = product/data canon · GitHub = implementation truth · VS Code/Copilot = local verification · Opus = architect/draft-PR author · Supabase = DB/auth/storage/RLS · Stripe = billing truth · PostHog = analytics · Sentry = errors · Vercel = deploy.

Build order (per repo `AGENTS.md`): Sprint Zero → Design System V1 → Discovery Card V1 → **Database V1** → feature surfaces. Does not duplicate PR #3 (substrate), PR #4 (contracts/media/icons/primitives), or PR #5 (design tokens).

Locked stack: Next.js 15 App Router + TypeScript (strict) · Supabase (Postgres/Auth/Storage/RLS) · Kysely in `packages/db` · Stripe · Resend · Azure AI Content Safety (ADR-042) · PostHog · Sentry · Vercel · pnpm + Turborepo · Node 24.16.0.

Rule: **do not invent** schema fields, enums, lifecycle states, permissions, or billing behavior. Canonical registries win over older pages. Unclear canon is marked `TODO(?)` and escalated.

---

## 1. Database schema needed for V1

Conventions (locked): UUID PKs · `snake_case_plural` tables, `snake_case` columns · `timestamptz` UTC `created_at`/`updated_at` · `archived_at`/`deleted_at` soft delete where history/billing/moderation/audit matters · JSONB only for flexible extension · status columns constrained to the Enum Registry · one canonical `listings` table (no per-category tables — G7).

| Domain | Tables |
| --- | --- |
| Identity & access | `users_profile_shadow`, `team_memberships` |
| Profiles | `seeker_profiles`, `seeker_resume_experiences`, `seeker_resume_educations`, `seeker_certifications`, `host_profiles` |
| Listings | `listings`, `listing_relevance_extensions`, `listing_media_overrides` |
| Applications / invites / offers | `saved_listings`, `applications`, `host_saved_seekers`, `host_skipped_seekers`, `invites`, `offers` |
| Media | `media_buckets`, `media_assets` |
| Matching & discovery | `match_results`, `candidate_pools`, `discovery_sessions`, `discovery_impressions` |
| Community & content | `community_photo_posts`, `host_announcements`, `platform_posts`, `feed_items`, `positive_reactions` |
| Monetization & entitlements | `subscriptions`, `plan_entitlements`, `add_on_purchases`, `invite_credit_ledger`, `boost_campaigns`, `featured_employer_campaigns`, `founding_program_state` |
| Messaging / scheduling / travel | `conversation_threads`, `messages`, `scheduling_requests`, `travel_plans` |
| Trust, reviews, moderation | `reviews`, `check_ins`, `reports`, `moderation_cases`, `moderation_actions`, `audit_logs` |
| Notifications | `notifications`, `notification_preferences`, `notification_delivery_log`, `notification_suppression_rules` |
| Analytics | `analytics_events`, `analytics_snapshots` |
| Billing infra | `stripe_webhook_events`, `service_credit_ledger` |

### Trust / verification (ADR-029)

Attestation-based, not verification-based. **No `verified_status` column** (G3). Use: `attestation_policy`, append-only `host_attestations`, mirror fields on `host_profiles` (`attestation_status`, `current_attestation_id`, `last_attested_at`, `last_attested_policy_version`) written **only** via `set_host_attestation()` RPC trigger (G2), admin-write-only `account_status`/`removed_*`, and `host_removal_appeals`. Verified Host badge requires `attestation_status='attested'` and the mandatory subtitle "Self-Declared by Host" (G22).

### Refund / dispute

`refund_reviews` (the only refund path — ADR-015 / G5), `dispute_cases`, `service_credit_ledger` (FIFO, 12-month expiry — G29).

---

## 2. What must wait

- Executing any migration / touching live Supabase.
- Production auth/session logic (Supabase Auth email + magic link; OAuth deferred).
- Stripe live mode (SKU seeding test-mode only, behind billing gate).
- Matching algorithm internals (only the monetization-free contract boundary is prepared).
- Merged RLS enforcement on `main`.
- Deferred features: external calendar sync (G9), hard KYC vendors (G25), seeker monetization (forever — G4), advanced/real-time analytics.

---

## 3. Enums & lifecycles that already exist

Do not invent values. Mirror the Notion **Canonical Enum Registry** and **Lifecycle Registry**. `packages/contracts/src/` stubs (`enums.ts`, `lifecycles.ts`, `permissions.ts`, `pricing.ts`, `events.ts`) plus PR #4 additions (`media.ts`, `categories.ts`, `benefits.ts`, `trust.ts`, `discovery-card.ts`) must be expanded/regenerated from the registries via `tools/scripts/sync-enums.ts` (G13).

Key enums: `ListingCategory` = farm·maritime·remote·seasonal·mix (lodge is a setting under seasonal, not a category); `ApplicationStatus` (no `declined`); `ConversationContextType` = invite·application·offer·dispute·support; ADR-029 `HostAttestationStatus` / `HostAccountStatus` / `HostRemovalAppealStatus`; `MediaAsset.moderation_status` includes `under_review`/`removed`.

Lifecycle rules incl. application auto-expiry 30d, invite 14d, offer 7d; all transitions enforced by `assert_lifecycle_transition()` (G16).

---

## 4. Contracts to create before implementation

Under `packages/contracts/src/`: `enums.ts`, `lifecycles.ts`, `permissions.ts`, `pricing.ts` (FOUNDER_LOCKED_PRICING in cents — see Notion ADR-028), `events.ts`, `retention.ts` (G28), `api.ts` (`ApiResponse<T>`/`ApiError`/`RequestContext` + error-code union). Under `packages/db/src/`: `types.gen.ts` (generated post-migration, CI-drift-checked), `client.ts` (Kysely), `helpers/`.

Do not duplicate PR #4 contracts (`VERIFIED_HOST_QUALIFIER = "Self-Declared by Host"`, etc.).

---

## 5. Supabase migration order (authored, not executed)

Numbered SQL files in `supabase/migrations/`, founder-approved before any run, additive only:

1. `001_extensions_and_enums` (+ `updated_at` + `assert_lifecycle_transition()` helpers)
2. `002_user_profile_shadow`
3. `003_profiles` (seeker_profiles, host_profiles, team_memberships)
4. `004_resume_tables`
5. `005_media`
6. `006_listings`
7. `007_applications_invites_offers`
8. `008_notifications_events`
9. `009_billing_entitlements`
10. `010_messaging_scheduling_travel`
11. `011_reports_moderation_audit`
12. `012_matching_discovery`
13. `013_community_content_feed`
14. `014_analytics_snapshots`

ADR-029 / refund / founding inserts (exact numbering `TODO(?)` for founder): attestation tables + `set_host_attestation()` + verified_status guard (with 003); `host_removal_appeals` (with 011); `refund_reviews` + `dispute_cases` + `service_credit_ledger` + `stripe_webhook_events` (with 009); `founding_program_state` + `claim_founding_seat()` (with 009); `notification_suppression_rules` (with 008). Plus safe public views: `public_listings_view`, `public_host_profiles_view`, `public_community_feed_view`.

---

## 6. RLS policies required

RLS on all user-facing tables; frontend locks are UX only. Public read only of `live` listings / `active` host profiles / `published` posts / `approved` community posts via safe views. Seeker-owner, host team-scoped, and admin-sub-role policies. Attestation write path denies direct mirror UPDATE (G2/G3). Messages participants-only (G12). Pending media not public (G10). Community reactions seeker-only. Demo isolation (G19). Coverage report → `docs/sprint-zero/rls-coverage.md`; tests → `supabase/tests/*.rls.sql`.

---

## 7. API routes & services

Thin handlers under `apps/web/app/api/v1/{domain}/{action}`; logic in `apps/web/services/<domain>/`. Every mutation calls `requireEntitlement()` (G14); sensitive/admin/billing/trust actions write `audit_logs` in-transaction (G15).

Services: `matching` (pure score, no monetization imports — G8), `discovery` (boost affects placement not score), `refund-review` (sole `stripe.refunds.create` caller — G5), `stripe`, `entitlements`, `notifications`, `moderation` (ModerationProvider over Azure — G27), `messaging` (rate-limited — G26), `media`.

Route domains: identity, completion, seeker, host, discovery, listings, applications, invites, offers, matches, messaging, scheduling, media, billing (+ idempotent `/webhooks/stripe` — G17), refund-reviews, verification→attestation, reports, admin, community/feed, demo. Each contract declares input/output schema, permission, events, notifications, analytics, error codes, idempotency.

---

## 8. What should be tested

Guardrails G1–G30 wired before feature code. Order: `pnpm lint` → `typecheck` → `test` → `db:assert` → `rls:test` → `e2e:guardrails`. Coverage: lifecycle transition fuzz (G16), match_score purity (G8), pricing-in-cents (G1/G23), Stripe webhook idempotency (G17), service-credit FIFO (G29), founding seat cap-race (G24); DB assertions (no verified_status G3 / no category tables G7 / no accepted_role G6 / retention map G28); RLS tests (attestation, pending media, messaging, demo, entitlement bypass); E2E (no seeker paywall G4, no calendar CTA G9, no public trust score G11, Verified Host subtitle G22, 18+ gate G25).

---

## 9. What agents must NOT build yet

No executed migrations / live Supabase; no production auth; no Stripe production/live billing; no matching algorithm; no production dashboards or real flows; no destructive ops; no merges. No reintroducing forbidden patterns: `verified_status`, `accepted_role`, per-category listing tables, monetization in match score, paid seeker features, auto Verified Host badge, external calendar sync, open social messaging, public trust scores. `main` stays human-merged (CLAOS specified, not enforced).

---

## 10. Founder approval required

Route to `docs/source-of-truth/founder-approval-queue.md` + `needs-founder` label: schema & migrations; auth; payments/refunds (Stripe SKU seed, RefundReview, live keys); verification/trust (ADR-029); permissions/RLS; pricing changes beyond ADR-028; paid-asset licensing; public launch/production deploy. Open decisions: ADR-029/refund/founding migration numbering; whether `apps/jobs` is a separate Vercel project; `team_memberships.role_preset` naming conflict (§11).

---

## 11. TODO(?) escalations & canon conflicts (registries win)

- `team_memberships.role_preset`: Data Dictionary (owner·recruiter·listing_manager·marketing·analyst) vs Permission Registry (owner·admin·hiring_manager·analyst·billing·viewer). **TODO(?)** use Permission Registry; founder to confirm.
- `Application.status = declined` — not in Enum Registry; registry wins (use `withdrawn` / `not_selected`).
- `ConversationContextType` must include `dispute` + `support` (registry wins).
- `MediaAsset.moderation_status` must include `under_review` + `removed` (registry wins).
- `SchedulingRequest.calendar_provider` / `external_calendar_event_id` — drop (G9).
- `HostProfile.verified_status` — forbidden; attestation model (ADR-029, G3).
- `mix` category matching/filter semantics — **TODO(?)** (matches all categories or none?).
- `category.lodge` icon-registry drift — already in founder queue.
- Matching weights/formula — authoritative in Notion Ranking/Matching pages; gated, do not implement.

---

## 12. Recommended sequencing (issues for coding agents)

After PR #4/#5 merge, in order: (1) Contracts V1; (2) Migrations V1 review-only (founder gate); (3) RLS + policies review-only (founder gate); (4) `packages/db` wiring; (5) Guardrails wiring; (6) Service skeletons; (7) Route contracts. Each = one `ready-for-engineering` issue → one Draft PR.
