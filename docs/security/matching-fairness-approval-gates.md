# Matching Fairness & Founder Approval Gates

> DRAFT — governance. This doc enumerates what must wait for founder approval and proposes new CI guardrails. Escalations are queued to `docs/source-of-truth/founder-approval-queue.md` (label: needs-founder).

## Founder approval gates (Mission Q14)

Founder approval is required before any of the following ship:

- final match weights
- using any AI model / external AI API
- storing match explanations
- inactivity penalty behavior
- host-visible ranking logic
- seeker-visible score wording
- automated reminders
- offer expiration policy (any change)
- not-selected behavior
- any fairness/legal-sensitive policy
- any protected/sensitive signal decision
- production matching deployment

## Existing guardrails relied upon (CI Guardrails Spec, locked)

- **G8** — match_score excludes monetization: `services/matching/` must not import pricing/entitlements/boost/featured; identical inputs differing only by tier yield identical score.
- **G11** — no public trust/score numerics: host-visible is categorical band; raw numeric admin-only.
- **G13** — enum/lifecycle values imported from contracts (no string literals).
- **G16** — lifecycle transitions validated via `assert_lifecycle_transition()` against `packages/contracts/lifecycles.ts`.
- **G18** — notification suppression/digest. **G20** — risky-surface feature flags default-off. **G28** — data retention policy. **G30** — single icon system.

## Proposed NEW guardrails (TODO(?) — founder to assign G-numbers; G1–G30 are locked, do not renumber)

1. No matching-algorithm implementation without an approved build pack.
2. No protected-class fields in matching contracts (lint denylist over prohibited signals).
3. No `auto_reject` / `auto_hire` functions anywhere.
4. No imports from billing/boost/featured into match-score logic (extends G8).
5. No match-score display component without a bound explanation contract.
6. No final hiring-decision automation.
7. No hidden disqualifying signal (every rank-affecting signal documented in the signal registry).
8. No social-media-scraping signal.
9. No notification sending without an approved notification build pack.
10. No data retention beyond approved policy (extends G28).

## Escalation

Each gate above is added to `founder-approval-queue.md` with a `needs-founder` label. Open Questions (event-name conflicts, anti-spam caps, band thresholds, host notes in V1) are logged to `docs/source-of-truth/open-questions.md`.
