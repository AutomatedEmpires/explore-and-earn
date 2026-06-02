# Discovery Card V1 — Product Spec

> Product rules for the core primitive. Visual spec: [`../design/discovery-card-v1.md`](../design/discovery-card-v1.md). Source of truth: Notion *Canonical Card System Specification*.

## Role

The Discovery Card is how a seeker evaluates an opportunity at a glance and decides to **open, save, or apply**. It must communicate the full value proposition — especially the triad — in a single scan.

## Data the card represents

| Field | Required | Notes |
| --- | --- | --- |
| scenic/lifestyle photo | yes | hero media |
| host avatar | yes | → host profile |
| host name | yes | |
| job title | yes | |
| location | yes | → map |
| begins / ends | yes | opportunity window |
| housing | yes | triad — "where will I sleep?" |
| meals | yes | triad — "what will I eat?" |
| pay | yes | triad — "what will I earn?" |
| Verified Host badge | yes | self-declared qualifier |
| category badge | yes | lane (farm/lodge/maritime/remote) |
| time-window / featured badge | conditional | when applicable; seasonality/time-window signal only, distinct from the Seasonal category lane |
| match score | conditional | matched surface only |
| boosted treatment | conditional | boosted surface only |
| Quick Apply | yes | primary action |

## Rules

- The **triad (Housing/Meals/Pay)** is mandatory and never relabeled "Perks."
- The **Verified Host badge** is mandatory and always carries the **"Self-Declared by Host"** qualifier (no implied platform verification — trust/legal gate).
- **One component** serves all surfaces; behavior varies by variant + props, not by forking.
- Boosted cards must be **subtle**, never spammy/ad-like.
- Status must never be conveyed by color alone.

## Surfaces

homepage · discovery feed · swipe · map (popup + drawer) · saved · applied · featured · matched · host applicant review · community.

## Actions & destinations

| Action | Destination / effect |
| --- | --- |
| tap card body | listing detail |
| tap location | map view |
| tap housing | housing detail + photo bucket |
| tap meals | meals detail + photo bucket |
| tap host | host profile |
| Quick Apply | apply / login flow |
| save | add to saved |
| report | moderation flow |

## Open questions

Tracked in [`../source-of-truth/open-questions.md`](../source-of-truth/open-questions.md) and Notion *Open Questions & Decision Log*. Do not invent answers — flag them.
