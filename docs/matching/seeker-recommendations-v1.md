# Seeker-Side Recommendations V1

> DRAFT — architecture only, no UI, no ranking implementation. Canonical from "Matching Pipeline / Scoring / Refresh", "Seeker Dashboard", "Discovery Card V1". Seeker-visible score wording is a founder approval gate.

Seeker recommendations help a seeker quickly find lifestyle-fit opportunities while preserving agency and never hiding critical requirements.

## What a seeker may see

- Recommended opportunities (Discovery Cards) ordered by relevance within their eligible pool.
- Optional match score or a plain-language **"why this fits"** summary (wording founder-gated).
- HOUSING / MEALS / PAY fit (the triad — never "perks").
- Location and date fit.
- Host verified / trust markers and housing/trust photos (canon: trust photos matter).
- Saved / applied / offered states for each opportunity.
- Reasons to complete their profile (completeness prompts that raise confidence).

## What must NOT be hidden

- Critical/hard requirements (required certs, visa constraints, housing-not-included) must be visible even when they lower the score — no hidden disqualifiers (Critical Rule).
- The recommendation must never imply a guarantee of being hired.

## Relationship to discovery & boost

Seeker recommendations are served by `services/discovery`, which **may** apply boost/featured **placement**. Placement ordering is distinct from match score; boost must never change the score (G8). Where boosted placement and relevance differ, the surface should remain explainable ("Featured" labeling) — exact treatment is **TODO(?)**.

## Agency & transparency

- Seekers should understand why something is recommended (explainability required).
- Seekers control their preferences; changing preferences triggers a high-impact recompute (see staleness in `match-score-model-v1.md`).
- "Not interested" is an explicit, recoverable seeker signal and is **not** the same as inactivity (see `../hiring/responsiveness-inactivity-v1.md`).

## Analytics

Surfacing/opening recommendations emits canonical events (`matched_bucket_viewed`, `match_reason_opened`, `match_score_clicked`, `empty_match_bucket_shown`, `match_pool_building_prompt_shown`). See `../analytics/matching-hiring-events-v1.md`.

## Not implemented here

No feed assembly, no ranking, no UI. Type references: `MatchRecommendation`, `MatchExplanation` in `packages/contracts/src/matching.ts`.
