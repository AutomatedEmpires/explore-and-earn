# services/discovery

> DRAFT — architecture only. No production ranking implemented. See `docs/architecture/matching-service-boundaries.md`.

## Role

Seeker-facing discovery feed and placement. May apply **boost/featured placement** — placement ordering only, never match score (guardrail G8).

## Allowed imports

- `@explore-and-earn/contracts`
- match read outputs from `services/matching`
- pricing/boost for **placement only**

## Forbidden imports

- anything that writes into or alters match score
- protected-class / sensitive signals

## Related contracts

`matching.ts`, `matching-events.ts`

## Future API routes (deferred)

- discovery feed
- recommended opportunities for a seeker

## Founder gates

Any ranking logic that blends paid placement with match score · seeker-visible score wording.
