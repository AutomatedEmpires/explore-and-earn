# Matching & Hiring Guardrail Acceptance Tests V1

> DRAFT — acceptance criteria for the verifier (VS Code) and Copilot/Codex. These are **Given/When/Then specifications**, not committed test code. Tests over **locked config** (G31-G34) are safe to implement now (pure data, no engine). Tests over the **scoring engine** (G8 runtime, caps, tie-break) are written here as the contract the future engine must satisfy, to be implemented when A-MATCH-DEPLOY is approved.

## How to use this doc

Each guardrail has an ID, the canon/source it enforces, and one or more **Given/When/Then** cases. The test framework is the repo standard (`pnpm test`); a Copilot/Codex agent should translate these into the project's runner. Config-invariant tests should live beside `packages/contracts/src/matching-config.ts`; engine tests live in `apps/web/services/matching` once that service is built.

## Config-invariant guardrails (safe to implement now — no engine)

### G31 — Component weights sum to 100
- **Given** `MATCH_COMPONENT_WEIGHTS_V1`
- **When** all values are summed
- **Then** the total is exactly `100`.

### G32 — Sub-weights sum to their parent
- **Given** `MATCH_SUBWEIGHTS_V1` and `MATCH_COMPONENT_WEIGHTS_V1`
- **When** each component's sub-weight block is summed
- **Then** it equals that component's top-level weight (timeline 20, skills 20, role 15, HMP 15, location 10, goals 10, completeness 5, behavioral 5).

### G33 — Thresholds strictly ordered
- **Given** `MATCH_BAND_THRESHOLDS_V1`
- **Then** `0 < developing_min < strong_min <= 100` (i.e. `0 < 50 < 75 <= 100`).
- **And** `MATCH_CONFIDENCE_DISPLAY_V1`: `0 < withhold_below < qualify_below < 100` (i.e. `0 < 40 < 60 < 100`).

### G34 — No stored explanation text
- **Given** `EXPLANATION_STORAGE_V1`
- **Then** `store_explanation_text === false` and `persist_structured_reasons_only === true`.
- **And** the `MatchResult` interface persists `reasons: MatchSignal[]` but **no** free-text explanation field.

### G8 (static) — No monetization or protected fields in scoring inputs
- **Given** the `MatchInput` interface in `matching.ts`
- **Then** it contains **no** key matching `/boost|tier|price|featured|plan|entitlement/i` and **no** protected/sensitive attribute (see `../matching/prohibited-signals-v1.md`).
- **And** `MATCH_COMPONENT_WEIGHTS_V1` contains no monetization component key.

### Determinism config checks
- **Tie-break order is total & non-random:** `MATCH_TIEBREAK_ORDER_V1` ends with a stable id-hash key and contains no `"random"` term.
- **Stacking rule is min-cap:** `MATCH_MODIFIER_STACKING_V1.rule === "apply_minimum_cap"`.
- **Missing-data never caps:** `MATCH_MISSING_DATA_POLICY_V1.missing_blocks_score_caps === false`.

## Engine-behavior guardrails (spec now, implement at A-MATCH-DEPLOY)

### G8 (runtime) — Monetization never changes score
- **Given** two `MatchInput`s identical except one belongs to a boosted/featured host
- **When** scored
- **Then** the `score` is identical. Boost may change discovery placement only (`services/discovery`), never score.

### G11 — Host surface shows band, not raw subscores
- **Given** a `MatchResult` rendered on a host candidate card
- **Then** the host sees the categorical **band** (+ numeric only at confidence >= 60); raw per-component subscores are never rendered host-side.

### Caps — minimum cap wins, every cap explained
- **Given** required-cert-missing (cap 60) AND housing-not-included (cap 65) both true, raw score 88
- **When** caps applied
- **Then** final score <= 60 **and** the explanation lists **both** concerns.

### Rounding / band consistency
- **Given** internal score 74.6, confidence >= 60
- **Then** band = `developing` and displayed number = `74` (never `75`).

### Tie-break determinism
- **Given** two candidates equal on score, confidence, required-skill coverage, applied_at, and version
- **When** ordered twice
- **Then** the order is identical across runs (stable id-hash), with no randomness.

### Missing data -> confidence, not score
- **Given** a seeker missing optional preferred-skill data
- **Then** the score is **not** capped and the preferred-skill sub-weight contributes 0; confidence is lowered and a completion prompt is surfaced.

### Confidence gate
- **Given** confidence 35
- **Then** score + band are withheld ("Building match"), regardless of raw score.

### G16 — Lifecycle transitions
- **Given** the canonical transition maps (applications/invites/offers)
- **When** an illegal transition is attempted
- **Then** it is rejected; runtime authority is `lifecycles.ts` (type maps are mirrors).

## Coverage matrix

| Guardrail | Type | Implement when |
| --- | --- | --- |
| G31, G32, G33, G34 | config invariant | now |
| G8 static, determinism config | config / type | now |
| G8 runtime, G11, caps, rounding, tie-break, missing-data, confidence gate | engine behavior | A-MATCH-DEPLOY |
| G16 | lifecycle | when lifecycles.ts runtime lands |

## Notes

- These tests enforce **explainability, no false precision, no hidden disqualifiers, no protected-class inference, and no monetization-in-score** — the directive's non-negotiables.
- G1-G30 remain owned by the CI Guardrails canon; G31-G34 are **proposed** here and require founder ratification of IDs/wording (`../source-of-truth/founder-approval-queue.md`).
