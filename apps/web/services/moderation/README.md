# services/moderation

> DRAFT — architecture only. No auto-decision over hiring. See `docs/matching/prohibited-signals-v1.md`.

## Role

Surface trust/safety concerns that can cap or hide a match (canonical hard modifier). Concerns must be explainable and must never encode protected attributes.

## Allowed imports

- `@explore-and-earn/contracts` (matching `MatchConcern`, hiring types)
- moderation read models

## Forbidden imports

- protected-attribute inference of any kind
- automated hiring/rejection decisions

## Related contracts

`matching.ts` (concern → cap/hide), `hiring.ts`

## Future API routes (deferred)

- concern lookup for a (seeker, listing)

## Founder gates

Any signal that hides candidates · trust-concern cap/hide thresholds · fairness/legal-sensitive policy.
