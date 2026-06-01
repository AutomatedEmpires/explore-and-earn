# Match Explanation V1

> DRAFT — architecture only. Storing explanations is a founder approval gate. Copy is not locked (TODO?).

Every host-facing match score MUST be explainable in plain language (Critical Rule: explainability required; guardrail: no score display without explanation contract).

## Structure

A `MatchExplanation` is derived from the stored `MatchResult.reasons` and contains:

1. **Top positive signals** — the strongest contributing fits (e.g., availability overlap, housing provided, pay meets minimum, skills match).
2. **Missing information** — gaps lowering confidence (e.g., no references yet, incomplete resume).
3. **Possible concerns** — surfaced hard-modifier conditions (e.g., required cert missing) stated as factual, explainable concerns — never a hidden disqualifier.
4. **Data freshness** — `generatedAt` / `staleAt`; show when the explanation may be out of date.
5. **What the user can improve** — actionable, agency-preserving prompts.
6. **What is NOT considered** — explicit note that protected/sensitive attributes and monetization are not used.

## Example (illustrative — copy not locked)

```
Why this match:
- Your availability overlaps the full season.
- Housing is provided, matching your preference.
- Pay range meets your minimum.
- Your farm-equipment experience matches the host requirements.
Missing:
- Profile has no references yet.
Not considered:
- Demographic, health, or other protected attributes. Boost/featured status.
```

## Rules

- **No false/generated explanations**: every line maps to a real signal contribution in `MatchResult.reasons`. No LLM free-text rationalization in V1.
- **No hidden disqualifying logic**: if a signal meaningfully changed rank or applied a cap, it must appear here.
- **Plain language**: human-readable; no raw subscores in host/seeker views (G11).
- **Both sides**: seekers see "why this fits / what to improve"; hosts see positives + concerns + freshness.
- Storage of explanation text (vs deriving on read) is a **founder approval gate**.
