# Responsiveness & Inactivity V1

> DRAFT — architecture only. Inactivity penalty behavior is a founder approval gate. Canonical from "Matching Pipeline", "Matching, Invites & Applicant Review".

A **cautious** responsiveness model. Internal-only signals; never public shaming.

## Candidate signals (internal-only)

- profile last active / activity recency
- invite response rate
- application response rate
- offer response rate
- recent ignored invites
- accepted-offer completion history
- notification delivery state

These map to the canonical `behavioral_reliability` weight (5) and confidence recency (10) — but the **penalty/weighting behavior is TODO(?) and founder-gated**.

## Rules (canon)

- Do **not** over-penalize early users (cold-start protection).
- Explain to a seeker if their profile appears inactive; provide a recovery path.
- **Separate "not interested" from "inactive"** — a deliberate decline is not inactivity.
- Avoid black-box suppression — any visibility effect must be explainable.
- Provide host-facing transparency only in aggregate/explainable form (e.g., "recently active"), never a raw penalty score.

## Recovery

- Activity restores standing. Exact recovery curve: **TODO(?)** (founder gate).

## Not implemented here

No scoring, no suppression logic, no ranking effect. Type-only `ResponsivenessSignal` in `packages/contracts/src/responsiveness.ts`.
