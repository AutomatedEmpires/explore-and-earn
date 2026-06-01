# Match Explanation V1

> DRAFT — architecture only. **Storage decision LOCKED 2026-05-31:** derive on read; do NOT store explanation text (ADR-0001 §13). Copy LOCKED 2026-05-31 (ADR-0001 §12). See [`match-tuning-v1-decisions.md`](./match-tuning-v1-decisions.md).

Every host-facing match score MUST be explainable in plain language (Critical Rule: explainability required; guardrail: no score display without explanation contract).

## Structure

A `MatchExplanation` is **derived from** the stored `MatchResult.reasons` (the explanation text itself is not persisted) and contains:

1. **Top positive signals** — the strongest contributing fits (e.g., availability overlap, housing provided, pay meets minimum, skills match).
2. **Missing information** — gaps lowering confidence (e.g., no references yet, incomplete resume).
3. **Possible concerns** — surfaced hard-modifier conditions (e.g., required cert missing) stated as factual, explainable concerns — never a hidden disqualifier.
4. **Data freshness** — `generatedAt` / `staleAt`; show when the explanation may be out of date.
5. **What the user can improve** — actionable, agency-preserving prompts ("Add this to improve your match").
6. **What is NOT considered** — explicit note that protected/sensitive attributes and monetization are not used.

## Storage (LOCKED — ADR-0001 §13)

- Persist only the structured `reasons[]` on `MatchResult`. Do **not** store rendered explanation text.
- Rationale: minimizes retention/privacy scope (G28), avoids stale/drifting text, and is cheap to regenerate from canonical reasons. Because no explanation text is stored, the `A-MATCH-EXPL-STORE` gate is satisfied by **not crossing it**. Proposed CI check **G34** enforces this.

## Copy (LOCKED — ADR-0001 §12)

- Header: **"Why this fits"**. Missing-info framing: **"Add this to improve your match"**.
- Band labels — seeker: Strong fit / Good fit / Partial fit; host: Strong / Developing / Needs attention (`BAND_LABELS_V1`).
- No sub-percent precision; a rounded integer score may accompany the band only at confidence >= 60.

## Example (illustrative)

```
Why this fits:
- Your availability overlaps the full season.
- Housing is provided, matching your preference.
- Pay range meets your minimum.
- Your farm-equipment experience matches the host requirements.
Add this to improve your match:
- Your profile has no references yet.
Not considered:
- Demographic, health, or other protected attributes. Boost/featured status.
```

## Symmetry: seeker view vs host view

| Section | Seeker view | Host view |
| --- | --- | --- |
| Top positive signals | "why this fits you" | "why this candidate fits the listing" |
| Missing information | what to add to your profile | what the candidate has not provided yet |
| Concerns | requirements you may not meet (with how to resolve) | factual hard-modifier concerns |
| Freshness | last updated | last updated |
| Not considered | protected attributes, boost | protected attributes, boost |

## Rules

- **No false/generated explanations**: every line maps to a real signal contribution in `MatchResult.reasons`. No LLM free-text rationalization in V1 (ADR-0001 §14: no AI/ML in V1).
- **No hidden disqualifying logic**: if a signal meaningfully changed rank or applied a cap, it must appear here.
- **Plain language**: human-readable; no raw subscores in host/seeker views (G11).
- **Confidence-gated**: when confidence < 40 the explanation is replaced by a "Building match — complete your profile" prompt rather than a misleadingly confident rationale (ADR-0001 §7).
