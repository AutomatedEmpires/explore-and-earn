# Match Aggregation Conformance Examples V1

> DRAFT — architecture/verification only. These are **golden fixtures for the AGGREGATION layer**, not the scoring engine. Each fixture takes **already-computed per-component contributions as GIVEN inputs** (stand-ins for the future per-signal scorers, which remain founder-gated / A-MATCH-DEPLOY) and pins down exactly how the **locked rules** combine them: weighting sum, hard-modifier caps, band derivation, confidence gating, display clamp, and tie-breaking. Config: `packages/contracts/src/matching-config.ts`. Rules: [`match-edge-cases-v1.md`](./match-edge-cases-v1.md). Tests: [`../security/matching-guardrail-tests-v1.md`](../security/matching-guardrail-tests-v1.md).

## What these fixtures DO and DO NOT pin down

- **DO** lock: how component points sum to a raw score; how the minimum cap is applied; how a band is derived (inclusive lower bound); how confidence gates display; how the display integer is clamped into its band; how ties resolve.
- **DO NOT** lock: how each component's points are *earned* from raw seeker/listing data (e.g. how `window_overlap_ratio` becomes points). That per-signal math is the gated engine and is **out of scope** here. Component contributions below are illustrative inputs, not canon outputs.

Component maxima (from `MATCH_COMPONENT_WEIGHTS_V1`): timeline 20, skills 20, role 15, HMP 15, location 10, goals 10, completeness 5, behavioral 5 (sum 100).

## Fixture 1 — Strong fit, full confidence, no caps

| Component | Contribution |
| --- | --- |
| timeline_availability | 19 |
| skills_certifications | 18 |
| role_category | 15 |
| housing_meals_pay | 13 |
| location_travel | 8 |
| goals_open_to | 8 |
| completeness_confidence | 5 |
| behavioral_reliability | 4 |

- Raw = 19+18+15+13+8+8+5+4 = **90**. No cap conditions.
- Band: 90 >= 75 -> **strong**.
- Confidence 78 (>= 60) -> full display.
- Display number = clamp(round(90), [75,100]) = **90**. Concerns: none.
- Host sees "Strong" + number; seeker sees "Strong fit".

## Fixture 2 — Developing, limited-info confidence

| Component | Contribution |
| --- | --- |
| timeline_availability | 14 |
| skills_certifications | 11 |
| role_category | 10 |
| housing_meals_pay | 9 |
| location_travel | 6 |
| goals_open_to | 5 |
| completeness_confidence | 4 |
| behavioral_reliability | 3 |

- Raw = **62**. No caps. Band: 50 <= 62 < 75 -> **developing**.
- Confidence 52 (40..59) -> show band + "based on limited info", **no number**.
- Host sees "Developing (limited info)"; seeker sees "Good fit".

## Fixture 3 — Strong raw fit, capped by missing required cert

| Component | Contribution |
| --- | --- |
| timeline_availability | 18 |
| skills_certifications | 16 |
| role_category | 14 |
| housing_meals_pay | 12 |
| location_travel | 8 |
| goals_open_to | 8 |
| completeness_confidence | 5 |
| behavioral_reliability | 3 |

- Raw = **84**. Condition: `required_cert_missing` (cap 60).
- Final score = min(84, 60) = **60**. Band: 60 -> **developing**.
- Confidence 70 (>= 60) -> full. Display = clamp(round(60), [50,74]) = **60**.
- Concern emitted: `required_cert_missing` ("Required certification not on file").
- Lesson: a strong raw fit is honestly pulled to Developing with a visible, explainable reason — never silently hidden.

## Fixture 4 — Two caps stack -> minimum wins, both explained

- Raw = **88**. Conditions true: `required_cert_missing` (cap 60) AND `housing_required_not_included` (cap 65).
- Applied cap = min(60, 65) = **60** (never averaged, never summed). Final = 60 -> **developing**.
- Concerns emitted: BOTH `required_cert_missing` and `housing_required_not_included`.
- Lesson: every cap that applies is surfaced (no hidden disqualifiers); the most restrictive ceiling governs the score.

## Fixture 5 — High raw, but withheld for low confidence (missing optional data)

| Component | Contribution |
| --- | --- |
| timeline_availability | 16 |
| skills_certifications | 12 |
| role_category | 12 |
| housing_meals_pay | 10 |
| location_travel | 7 |
| goals_open_to | 6 |
| completeness_confidence | 2 |
| behavioral_reliability | 3 |

- Raw = **68**. No cap (missing optional data NEVER caps — `MATCH_MISSING_DATA_POLICY_V1`).
- Confidence 32 (< 40) -> **withhold** score + band; show "Building match — complete your profile".
- Lesson: incompleteness routes to confidence + a completion prompt, not to a score penalty.

## Fixture 6 — Rounding/clamp boundary

- Raw float = **74.6** (a fractional component contribution, e.g. partial pay-above-minimum margin). No caps.
- Band from internal float: 74.6 < 75 -> **developing**.
- Confidence 65 (>= 60) -> full. Naive round(74.6) = 75, but clamp into [50,74] = **74**.
- Lesson: the shown number can never read "75" beside a "Developing" band.

## Fixture 7 — Tie-break ordering

Two candidates for the same listing:

| | Cand A | Cand B |
| --- | --- | --- |
| score | 82 | 82 |
| confidence | 70 | 70 |
| required_skill_coverage | 12/12 | 10/12 |
| applied_at | later | earlier |

- Steps 1-2 tie. Step 3 (required-skill coverage desc): **A > B**. `applied_at` never consulted.
- If A and B also tied on coverage, step 4 would prefer the **earlier** `applied_at` (B), then version, then stable id-hash.
- Lesson: fit (coverage) outranks promptness; engagement is never a primary key; final ordering is deterministic and reproducible.

## Fixture 8 — G8: boosted host does not change score

- Identical seeker inputs scored against two listings, one from a boosted/featured host, one not.
- Both raw = **77** -> identical score, band **strong**. Boost affects **discovery placement** in `services/discovery` only — never the score in `services/matching`.
- Lesson: monetization is structurally absent from `MatchInput` and from the weight table (G8).

## Conformance checklist (for the future engine)

- [ ] Raw = sum of component contributions (no hidden terms).
- [ ] Caps applied as `min` of all triggered caps; every triggered cap yields a concern.
- [ ] Band from internal (unrounded) score; inclusive lower bounds (>=75, >=50).
- [ ] Display number shown only at confidence >= 60, half-up rounded, clamped into band range.
- [ ] Confidence < 40 withholds; 40..59 shows band w/o number; >= 60 shows number.
- [ ] Missing data never caps or penalizes score; it lowers confidence.
- [ ] Tie-break follows `MATCH_TIEBREAK_ORDER_V1` exactly; deterministic, no randomness.
- [ ] Boost/tier/featured never alter score (G8).

## Open items

- `TODO(?)` Per-signal point functions (how each contribution is earned) — gated (A-MATCH-DEPLOY); fixtures here intentionally take contributions as inputs.
- Canon-sync of these conformance rules into Notion (`Q-CANON-SYNC-MATCH`).
