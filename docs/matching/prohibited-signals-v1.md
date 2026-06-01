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

## Handling

- Any uncertainty about whether a signal is a proxy for a protected attribute (e.g., location, name, school) is routed to **founder/legal approval** before use.
- These prohibitions apply to direct fields **and** to derived/inferred proxies.
- Trust & safety / moderation concerns may cap or hide a match (canon hard modifier), but must be explainable and must not encode protected attributes.
