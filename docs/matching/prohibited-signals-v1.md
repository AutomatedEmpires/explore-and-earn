# Prohibited Signals V1

> DRAFT — fairness/legal-sensitive. Any change is a founder + legal approval gate. Enforced by proposed guardrail (no protected-class fields in matching contracts).

The matching/ranking system MUST NOT use, store, infer, or weight any of the following. Matching contracts MUST NOT define fields for these.

## Prohibited attributes

- race
- ethnicity
- religion
- sex
- gender identity
- sexual orientation
- age (except where strictly required for legal/work eligibility, handled as a compliance gate, not a match signal)
- disability
- health status
- pregnancy
- marital status
- national origin
- genetic information
- political affiliation
- financial hardship
- private medical details
- unverified personality inference
- appearance / attractiveness

## Prohibited behaviors

- scraping social media without consent
- inferring protected traits from names or photos
- penalizing lawful protected activity
- black-box rejection without explanation
- automated final hiring or rejection decisions (the system ranks/recommends/explains only)

## Proxy guardrails

Prohibitions apply to **direct fields and to derived/inferred proxies**. A signal that strongly correlates with a protected attribute (e.g., name origin, neighborhood, specific schools) must not be used to infer that attribute. When a legitimate signal (location, credential) carries proxy risk, it must be tied to an explicit listing requirement, surfaced in explanations, and weight-locked only after the founder/legal gate (see `match-signal-registry-v1.md`).

## Handling

- Any uncertainty about whether a signal is a proxy for a protected attribute is routed to **founder/legal approval** before use (logged in `../source-of-truth/founder-approval-queue.md`).
- Trust & safety / moderation concerns may cap or hide a match (canon hard modifier), but must be explainable and must not encode protected attributes.

## Enforcement

Proposed guardrail: a contracts lint denylist over the terms above prevents protected-class fields from entering `packages/contracts/src/matching.ts` or any matching service. See `../security/matching-fairness-approval-gates.md`.
