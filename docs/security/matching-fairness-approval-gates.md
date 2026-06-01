# Matching Fairness & Founder Approval Gates

> DRAFT — governance. This doc enumerates what must wait for founder approval and proposes new CI guardrails. Escalations are queued to `docs/source-of-truth/founder-approval-queue.md` (label: needs-founder).
>
> **2026-05-31 update.** The founder authorized the architect to determine match tuning. The gates below are re-classified into **Resolved** (locked in [ADR-0001](../source-of-truth/decisions/ADR-0001-matching-tuning-v1.md) + [`../matching/match-tuning-v1-decisions.md`](../matching/match-tuning-v1-decisions.md)) and **Still gated**.

## Gate status (Mission Q14)

**Resolved / locked 2026-05-31:**

- final match weights + sub-weights (ADR-0001 §1-§2)
- host-visible ranking logic + band thresholds (§6)
- seeker-visible score wording (§12)
- inactivity penalty behavior + cold-start + recovery (§5)
- automated reminder **policy/schedule** (§9) — sending still deferred
- offer expiration policy (§10)
- not-selected behavior (§11)
- storing match explanations -> derive-on-read, not stored (§13)
- AI model / external AI API -> not used in V1 (§14)

**Still gated (must wait):**

- **production matching deployment** — blocked until guardrails green + human merge + proxy/legal review.
- **proxy/fairness-sensitive signals** — weights locked but tied to explicit listing requirements; **legal review recommended before production** (A-MATCH-PROXY).
- **notification sending** — deferred to an approved Notification build pack.
- any **new** protected/sensitive signal decision; any final-hiring automation (never).

## Existing guardrails relied upon (CI Guardrails Spec, locked)

- **G8** — match_score excludes monetization: `services/matching/` must not import pricing/entitlements/boost/featured; identical inputs differing only by tier yield identical score.
- **G11** — no public trust/score numerics: host-visible is categorical band; raw numeric admin-only.
- **G13** — enum/lifecycle values imported from contracts (no string literals).
- **G16** — lifecycle transitions validated via `assert_lifecycle_transition()` against `packages/contracts/lifecycles.ts`.
- **G18** — notification suppression/digest. **G20** — risky-surface feature flags default-off. **G28** — data retention policy. **G30** — single icon system.

## Proposed NEW guardrails (TODO(?) — founder to assign G-numbers; G1-G30 are locked, do not renumber)

1. No matching-algorithm implementation without an approved build pack (the **engine** stays gated even though config is locked).
2. No protected-class fields in matching contracts (lint denylist over prohibited signals).
3. No `auto_reject` / `auto_hire` functions anywhere.
4. No imports from billing/boost/featured into match-score logic (extends G8).
5. No match-score display component without a bound explanation contract.
6. No final hiring-decision automation.
7. No hidden disqualifying signal (every rank-affecting signal documented in the signal registry).
8. No social-media-scraping signal.
9. No notification sending without an approved notification build pack.
10. No data retention beyond approved policy (extends G28).
11. **(G31 proposed)** `MATCH_COMPONENT_WEIGHTS_V1` sums to exactly 100.
12. **(G32 proposed)** each block in `MATCH_SUBWEIGHTS_V1` sums to its parent component weight.
13. **(G33 proposed)** band thresholds strictly ordered: `0 <= developing_min < strong_min <= 100`.
14. **(G34 proposed)** no stored explanation text — explanation derived from `MatchResult.reasons` (enforces ADR-0001 §13).

## Escalation

Resolved gates are recorded in `founder-approval-queue.md` (status Approved 2026-05-31) and ADR-0001. Remaining gates keep their `needs-founder` label. Canon-sync of the locked values back into Notion is tracked as `Q-CANON-SYNC-MATCH` in `open-questions.md`.
