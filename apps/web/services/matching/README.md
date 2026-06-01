# services/matching

> DRAFT — architecture only. No algorithm, ML/AI, external AI API, or production ranking is implemented. See `docs/matching/matching-v1-build-pack.md`.

## Role

Compute and serve `MatchResult` (score 0-100, confidence 0-100, reasons) and build eligible candidate pools. Assistive relevance only — never a hiring decision.

## Allowed imports

- `@explore-and-earn/contracts` (matching, applications, hiring, responsiveness, matching-events types)
- future `packages/db` read models; profile/listing read models

## Forbidden imports

- `pricing` / `entitlements` / `boost` / `featured` (guardrail G8 — monetization must not affect score)
- any protected-class / sensitive signal source (see `docs/matching/prohibited-signals-v1.md`)
- external AI APIs; notification senders; auto-decision logic

## Related contracts

`matching.ts`, `applications.ts`, `hiring.ts`, `responsiveness.ts`, `matching-events.ts`

## Future API routes (deferred)

- read ranked candidate pool for a listing
- read match explanation for a (seeker, listing)
- internal recompute/refresh trigger

## Founder gates

Final weights · AI/model use · inactivity penalty · production matching deploy · host-visible ranking logic.
